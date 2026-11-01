import Foundation

enum PrimeVoiceIntent: Equatable {
  case wake
  case status
  case open(app: String)
  case search(query: String)
  case none
}

func primeSpeechLocalePreference() -> [String] {
  ["en-IN", "hi-IN", "en-US"]
}

func primeVoiceLanguage(for utterance: String) -> String {
  utterance.unicodeScalars.contains { (0x0900...0x097F).contains($0.value) } ? "hi-IN" : "en-IN"
}

struct PrimeCommandWindow {
  private var expiresAt = Date.distantPast

  mutating func accept(_ intent: PrimeVoiceIntent, at now: Date) -> PrimeVoiceIntent {
    if intent == .wake {
      expiresAt = now.addingTimeInterval(8)
      return .wake
    }
    return now <= expiresAt ? intent : .none
  }
}

struct PrimeGreetingGate {
  private let idleInterval: TimeInterval = 15 * 60
  private var lastCommandAt = Date.distantPast
  private var lastGreetingAt = Date.distantPast

  mutating func shouldGreet(at now: Date) -> Bool {
    guard now.timeIntervalSince(lastCommandAt) >= idleInterval,
          now.timeIntervalSince(lastGreetingAt) >= idleInterval else {
      return false
    }
    lastGreetingAt = now
    return true
  }

  mutating func recordCommand(at now: Date) {
    lastCommandAt = now
  }
}

private let primeAppAliases = [
  "calendar": "calendar",
  "कैलेंडर": "calendar",
  "finder": "finder",
  "फाइंडर": "finder",
  "notes": "notes",
  "नोट्स": "notes",
  "reminders": "reminders",
  "रिमाइंडर्स": "reminders",
  "whatsapp": "whatsapp",
  "व्हाट्सएप": "whatsapp",
  "spotify": "spotify",
  "स्पॉटिफ़ाय": "spotify",
  "settings": "settings",
  "setting": "settings",
  "सेटिंग्स": "settings",
  "safari": "safari",
  "सफारी": "safari",
  "mail": "mail",
  "मेल": "mail",
  "messages": "messages",
  "message": "messages",
  "मैसेज": "messages",
  "photos": "photos",
  "फोटोज": "photos",
  "music": "music",
  "म्यूजिक": "music",
  "contacts": "contacts",
  "contact": "contacts",
  "कॉन्टैक्ट्स": "contacts",
  "calculator": "calculator",
  "calc": "calculator",
  "maps": "maps",
  "map": "maps",
  "textedit": "textedit",
]

private let primeOpenWords: Set<String> = ["open", "khol", "kholo", "खोलो"]
private let primeStatusWords: Set<String> = ["status", "स्टेटस", "स्थिति"]
private let primeStatusFollowUps: Set<String> = ["batao", "बताओ", "dikhao", "दिखाओ", "check", "देखो"]
private let primeSearchWords: Set<String> = ["search", "google", "ढूंढो", "खोजो"]

private func primeCommandWords(_ transcript: String) -> [String]? {
  let words = normalizedWords(transcript)
  if words.starts(with: ["hey", "prime"]) || words.starts(with: ["हे", "प्राइम"]) {
    return Array(words.dropFirst(2))
  }
  if words.first == "prime" || words.first == "प्राइम" {
    return Array(words.dropFirst())
  }
  return nil
}

func isPrimeWakePhrase(_ transcript: String) -> Bool {
  primeCommandWords(transcript) != nil
}

func parsePrimeVoiceIntent(_ transcript: String) -> PrimeVoiceIntent {
  guard let words = primeCommandWords(transcript) else { return .none }
  guard let verb = words.first else { return .wake }

  if primeStatusWords.contains(verb) {
    if words.count == 1 { return .status }
    if words.count == 2, primeStatusFollowUps.contains(words[1]) { return .status }
    return .none
  }

  if primeOpenWords.contains(verb), words.count >= 2, let app = primeAppAliases[words[1]] {
    if words.count == 2 { return .open(app: app) }
  }

  if primeSearchWords.contains(verb) {
    let queryWords: [String]
    if words.count >= 4, words[1] == "google", words[2] == "for" {
      queryWords = Array(words.dropFirst(3))
    } else if words.count >= 3, words[1] == "for" {
      queryWords = Array(words.dropFirst(2))
    } else {
      queryWords = Array(words.dropFirst())
    }
    let query = queryWords.joined(separator: " ")
    if !query.isEmpty && query.count <= 200 { return .search(query: query) }
  }

  if words.count == 1, let app = primeAppAliases[words[0]] {
    return .open(app: app)
  }

  if words.count == 2, let app = primeAppAliases[words[0]], primeOpenWords.contains(words[1]) {
    return .open(app: app)
  }

  return .none
}

func primeActionAcknowledgement(_ intent: PrimeVoiceIntent) -> String? {
  switch intent {
  case .status:
    return "Yes boss. Checking this Mac's status."
  case .open:
    return "Opening, boss."
  case .search:
    return "Searching, boss."
  case .wake, .none:
    return nil
  }
}
