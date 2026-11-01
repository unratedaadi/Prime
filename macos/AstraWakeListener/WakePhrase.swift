import Foundation

func normalizedWords(_ transcript: String) -> [String] {
  transcript
    .lowercased()
    .components(separatedBy: CharacterSet.alphanumerics.inverted)
    .filter { !$0.isEmpty }
}

func isWakePhrase(_ transcript: String) -> Bool {
  isPrimeWakePhrase(transcript)
}

func approvedAppCommand(_ transcript: String) -> String? {
  guard case let .open(app) = parsePrimeVoiceIntent(transcript) else { return nil }
  return app
}
