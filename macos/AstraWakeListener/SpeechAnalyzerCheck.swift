import AVFoundation
import Speech

@available(macOS 26.0, *)
func verifySpeechAnalyzerAPIs() async throws {
  guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) else { return }
  let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
  let modules: [any SpeechModule] = [transcriber]
  if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
    try await request.downloadAndInstall()
  }
  let (inputSequence, inputContinuation) = AsyncStream.makeStream(of: AnalyzerInput.self)
  let analyzer = SpeechAnalyzer(modules: modules)
  try await analyzer.start(inputSequence: inputSequence)
  let _ = inputContinuation
  let _ = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules)
}
