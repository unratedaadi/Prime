import Foundation

enum PrimeVoiceEvent: Equatable {
  case ignored
  case ready
  case command(String)
  case cancelled
}

/// Routes completed speech segments; it never interprets an unfinished hypothesis as an action.
struct PrimeVoiceSession {
  private var expiresAt = Date.distantPast
  private var lastCommand = ""
  private var lastCommandAt = Date.distantPast
  private static let wake = try! NSRegularExpression(
    pattern: #"^\s*(?:(?:hey|हे)[\s,!.:\-]+)?(?:prime|प्राइम)(?=$|[\s,!.:;?\-])[\s,!.:;?\-]*"#,
    options: [.caseInsensitive]
  )

  mutating func openFollowUp(at now: Date) {
    expiresAt = now.addingTimeInterval(15)
  }

  mutating func cancel() {
    expiresAt = .distantPast
  }

  mutating func accept(_ transcript: String, isFinal: Bool, at now: Date) -> PrimeVoiceEvent {
    guard isFinal else { return .ignored }
    let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, text.count <= 2000 else { return .ignored }
    let source = text as NSString
    let match = Self.wake.firstMatch(in: text, range: NSRange(location: 0, length: source.length))
    let command: String
    if let match {
      command = source.substring(from: match.range.length).trimmingCharacters(in: .whitespacesAndNewlines)
      if command.isEmpty {
        openFollowUp(at: now)
        return .ready
      }
    } else {
      guard now <= expiresAt else { return .ignored }
      command = text
    }
    cancel()
    let normalized = command.lowercased().trimmingCharacters(in: .punctuationCharacters.union(.whitespacesAndNewlines))
    if ["cancel", "never mind", "nevermind", "stop listening", "रद्द करो"].contains(normalized) { return .cancelled }
    // English and Hindi transcribers may both finalize the same utterance.
    guard normalized != lastCommand || now.timeIntervalSince(lastCommandAt) > 4 else { return .ignored }
    lastCommand = normalized
    lastCommandAt = now
    return .command(command)
  }
}
