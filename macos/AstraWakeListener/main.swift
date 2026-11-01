import AppKit
import AVFoundation
import Foundation
import Speech

private final class MicrophoneGate: @unchecked Sendable {
  private let lock = NSLock()
  private var blocked = false
  private var resumeAt = Date.distantPast
  func setBlocked(_ value: Bool) {
    lock.lock(); defer { lock.unlock() }
    blocked = value
    if !value { resumeAt = Date().addingTimeInterval(0.7) }
  }
  var allowsAudio: Bool {
    lock.lock(); defer { lock.unlock() }
    return !blocked && Date() >= resumeAt
  }
}

private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}

@MainActor
final class WakeListener: NSObject, AVSpeechSynthesizerDelegate {
  private let audioEngine = AVAudioEngine()
  private let synthesizer = AVSpeechSynthesizer()
  private var analyzer: SpeechAnalyzer?
  private var transcribers: [SpeechTranscriber] = []
  private var inputContinuation: AsyncStream<AnalyzerInput>.Continuation?
  private var setupTask: Task<Void, Never>?
  private var transcriptionTasks: [Task<Void, Never>] = []
  private var awakeActivity: NSObjectProtocol?
  private var voiceSession = PrimeVoiceSession()
  private var awaitingConfirmation = false
  private var followUpAfterSpeech = false
  private var processing = false
  private var paused = false
  nonisolated private let microphoneGate = MicrophoneGate()
  private var commandTask: URLSessionDataTask?
  private lazy var commandClient = URLSession(configuration: .ephemeral, delegate: RejectRedirects(), delegateQueue: nil)
  private let report: (String) -> Void

  init(report: @escaping (String) -> Void) {
    self.report = report
    super.init()
    synthesizer.delegate = self
  }

  func start() {
    paused = false
    report("Requesting speech and microphone access")
    SFSpeechRecognizer.requestAuthorization { [weak self] authorization in
      guard authorization == .authorized else {
        Task { @MainActor in self?.report("Speech recognition permission was not granted") }
        return
      }
      AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
        Task { @MainActor in
          guard let self, !self.paused else { return }
          guard granted else {
            self.report("Microphone permission was not granted")
            return
          }
          self.beginRecognition()
        }
      }
    }
  }

  private func beginRecognition() {
    guard !paused else { return }
    stopRecognition()
    setupTask = Task { [weak self] in await self?.configureOnDeviceTranscription() }
  }

  private func stopRecognition() {
    setupTask?.cancel()
    setupTask = nil
    transcriptionTasks.forEach { $0.cancel() }
    transcriptionTasks = []
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
    inputContinuation?.finish()
    inputContinuation = nil
    if let analyzer {
      Task { await analyzer.cancelAndFinishNow() }
    }
    analyzer = nil
    transcribers = []
    if let awakeActivity {
      ProcessInfo.processInfo.endActivity(awakeActivity)
      self.awakeActivity = nil
    }
  }

  private func configureOnDeviceTranscription() async {
    guard SpeechTranscriber.isAvailable else {
      report("On-device speech recognition is unavailable")
      return
    }
    let locales = await supportedTranscriptionLocales()
    guard !locales.isEmpty else {
      report("Offline English or Hindi speech model is unavailable")
      return
    }

    let transcribers = locales.map { SpeechTranscriber(locale: $0, preset: .progressiveTranscription) }
    let modules: [any SpeechModule] = transcribers.map { $0 as any SpeechModule }
    do {
      if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
        report("Preparing offline English and Hindi speech models")
        try await request.downloadAndInstall()
      }
      guard !Task.isCancelled else { return }
      guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules) else {
        report("No compatible on-device speech audio format")
        return
      }

      let (inputSequence, continuation) = AsyncStream.makeStream(of: AnalyzerInput.self)
      let analyzer = SpeechAnalyzer(modules: modules)
      try await analyzer.prepareToAnalyze(in: format)
      try await analyzer.start(inputSequence: inputSequence)
      guard !Task.isCancelled else {
        await analyzer.cancelAndFinishNow()
        return
      }

      self.transcribers = transcribers
      self.analyzer = analyzer
      self.inputContinuation = continuation
      let inputNode = audioEngine.inputNode
      let inputFormat = inputNode.outputFormat(forBus: 0)
      guard let converter = AVAudioConverter(from: inputFormat, to: format) else {
        report("Microphone audio format is unavailable")
        await analyzer.cancelAndFinishNow()
        return
      }
      inputNode.removeTap(onBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { buffer, _ in
        guard self.microphoneGate.allowsAudio else { return }
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 32)
        guard let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
        var conversionError: NSError?
        var suppliedInput = false
        let status = converter.convert(to: converted, error: &conversionError) { _, outStatus in
          guard !suppliedInput else { outStatus.pointee = .noDataNow; return nil }
          suppliedInput = true
          outStatus.pointee = .haveData
          return buffer
        }
        guard conversionError == nil, status == .haveData || status == .inputRanDry, converted.frameLength > 0 else { return }
        continuation.yield(AnalyzerInput(buffer: converted))
      }
      audioEngine.prepare()
      try audioEngine.start()
      awakeActivity = ProcessInfo.processInfo.beginActivity(
        options: [.idleSystemSleepDisabled],
        reason: "PRIME is listening for Prime or Hey Prime; let the display sleep but keep the Mac awake"
      )
      report("Listening locally for ‘Prime’ or ‘Hey Prime’")

      transcriptionTasks = transcribers.map { transcriber in
        Task { @MainActor [weak self, transcriber] in
          do {
            for try await result in transcriber.results {
              let transcript = String(result.text.characters)
              self?.handleTranscript(transcript, isFinal: result.isFinal)
            }
          } catch {
            self?.recoverFromTranscriptionFailure()
          }
        }
      }
    } catch {
      report("Unable to start on-device speech recognition")
      stopRecognition()
    }
  }

  func pause() {
    paused = true
    voiceSession.cancel()
    followUpAfterSpeech = false
    synthesizer.stopSpeaking(at: .immediate)
    microphoneGate.setBlocked(true)
    stopRecognition()
    report("Paused — microphone is off")
  }

  func resume() {
    guard !processing else { report("Finishing the current command; retry in a moment"); return }
    paused = false
    microphoneGate.setBlocked(false)
    start()
  }

  func retry() {
    guard !processing else { report("Finishing the current command; retry in a moment"); return }
    resume()
  }

  private func supportedTranscriptionLocales() async -> [Locale] {
    var locales: [Locale] = []
    for identifier in primeSpeechLocalePreference() {
      guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: identifier)) else { continue }
      if identifier == "en-US", locales.contains(where: { $0.identifier.lowercased().hasPrefix("en") }) {
        continue
      }
      if !locales.contains(where: { $0.identifier == locale.identifier }) {
        locales.append(locale)
      }
    }
    return locales
  }

  private func handleTranscript(_ transcript: String, isFinal: Bool) {
    guard !paused, !processing, microphoneGate.allowsAudio, !synthesizer.isSpeaking else { return }
    switch voiceSession.accept(transcript, isFinal: isFinal, at: Date()) {
    case .ignored:
      return
    case .ready:
      report("Listening for your command")
      speak("Yes?", followUp: true)
    case .cancelled:
      if awaitingConfirmation {
        dispatchAssistant("cancel")
      } else {
        report("Cancelled — listening for ‘Prime’")
      }
    case let .command(text):
      report("Heard a completed command — processing locally")
      dispatchAssistant(text)
    }
  }

  private func speak(_ text: String, followUp: Bool = false) {
    followUpAfterSpeech = followUp
    microphoneGate.setBlocked(true)
    let utterance = AVSpeechUtterance(string: String(text.prefix(4000)))
    utterance.voice = AVSpeechSynthesisVoice(language: primeVoiceLanguage(for: text))
    utterance.rate = 0.46
    utterance.volume = 0.88
    synthesizer.speak(utterance)
  }

  nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    Task { @MainActor in self.finishedSpeaking() }
  }

  private func finishedSpeaking() {
    guard !paused else { return }
    microphoneGate.setBlocked(false)
    if followUpAfterSpeech {
      voiceSession.openFollowUp(at: Date())
      report(awaitingConfirmation ? "Say yes or cancel to confirm the proposed action" : "Listening for your command")
    } else {
      report("Listening locally for ‘Prime’ or ‘Hey Prime’")
    }
    followUpAfterSpeech = false
  }

  private func recoverFromTranscriptionFailure() {
    guard !Task.isCancelled, !paused else { return }
    report("Restarting local speech listener")
    stopRecognition()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.beginRecognition() }
  }

  private func dispatchAssistant(_ text: String) {
    guard !processing else { return }
    let keyURL = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".astra/agent-key")
    guard let key = try? String(contentsOf: keyURL, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), !key.isEmpty else {
      report("Mac agent setup is required")
      speak("The local Mac agent is not set up yet. Please open PRIME to finish setup.")
      return
    }
    guard let url = URL(string: "http://127.0.0.1:27182/v1/assistant") else { return }
    var request = URLRequest(url: url, timeoutInterval: 60)
    request.httpMethod = "POST"
    request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["text": text])
    processing = true
    microphoneGate.setBlocked(true)
    report("Working on your command locally")
    commandTask = commandClient.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        self.commandTask = nil
        self.processing = false
        guard !self.paused else { return }
        guard error == nil, let status = (response as? HTTPURLResponse)?.statusCode else {
          self.report("Local Mac agent unavailable")
          self.speak("I could not reach the local Mac agent. Please check that it is running. I will not retry the action automatically.")
          return
        }
        guard (200..<300).contains(status), let data, data.count <= 1_000_000,
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              body["ok"] as? Bool == true,
              let result = body["data"] as? [String: Any],
              let message = result["message"] as? String, !message.isEmpty else {
          self.report("Local assistant could not complete the request")
          self.speak("I could not complete that request. Please check the PRIME dashboard before trying again.")
          return
        }
        self.awaitingConfirmation = result["needsConfirmation"] as? Bool == true
        self.report(self.awaitingConfirmation ? "Waiting for your confirmation" : "Command completed")
        self.speak(message, followUp: self.awaitingConfirmation)
      }
    }
    commandTask?.resume()
  }

}

@MainActor
final class StatusMenu: NSObject {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let stateItem = NSMenuItem(title: "Starting Prime…", action: nil, keyEquivalent: "")
  var pauseListening: (@MainActor () -> Void)?
  var resumeListening: (@MainActor () -> Void)?
  var retryListening: (@MainActor () -> Void)?

  override init() {
    super.init()
    statusItem.button?.title = "Prime"
    statusItem.button?.toolTip = "Starting Prime…"
    let menu = NSMenu()
    menu.addItem(stateItem)
    menu.addItem(.separator())
    for (title, action) in [("Pause microphone", #selector(pause)), ("Resume microphone", #selector(resume)), ("Retry speech setup", #selector(retry))] {
      let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
      item.target = self
      menu.addItem(item)
    }
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "Quit Prime Wake Listener", action: #selector(quit), keyEquivalent: "q"))
    statusItem.menu = menu
  }

  func update(_ state: String) {
    DispatchQueue.main.async {
      self.stateItem.title = state
      self.statusItem.button?.toolTip = state
    }
    let directory = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".prime", isDirectory: true)
    let statusFile = directory.appendingPathComponent("wake-listener-status.txt")
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? state.write(to: statusFile, atomically: true, encoding: .utf8)
  }

  @objc private func pause() { pauseListening?() }
  @objc private func resume() { resumeListening?() }
  @objc private func retry() { retryListening?() }

  @objc private func quit() {
    NSApplication.shared.terminate(nil)
  }
}

MainActor.assumeIsolated {
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let statusMenu = StatusMenu()
let listener = WakeListener(report: statusMenu.update)
statusMenu.pauseListening = { listener.pause() }
statusMenu.resumeListening = { listener.resume() }
statusMenu.retryListening = { listener.retry() }
listener.start()
application.run()

}
