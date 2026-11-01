import Foundation

@main
struct PrimeVoiceCommandTests {
  static func main() {
    precondition(isPrimeWakePhrase("Prime"))
    precondition(isPrimeWakePhrase("Hey Prime, open Notes"))
    precondition(isPrimeWakePhrase("prime status on another computer"))
    precondition(!isPrimeWakePhrase("please ask Prime later"))
    precondition(!isPrimeWakePhrase("hey"))

    precondition(parsePrimeVoiceIntent("Prime") == .wake)
    precondition(parsePrimeVoiceIntent("Hey Prime, status") == .status)
    precondition(parsePrimeVoiceIntent("Prime status on another computer") == .none)
    precondition(parsePrimeVoiceIntent("Prime, open Notes") == .open(app: "notes"))
    precondition(parsePrimeVoiceIntent("Prime, Spotify") == .open(app: "spotify"))
    precondition(parsePrimeVoiceIntent("Prime, Safari") == .open(app: "safari"))
    precondition(parsePrimeVoiceIntent("Prime, Messages") == .open(app: "messages"))
    precondition(parsePrimeVoiceIntent("Prime, search Google for weather in Mumbai") == .search(query: "weather in mumbai"))
    precondition(parsePrimeVoiceIntent("Prime, open WhatsApp") == .open(app: "whatsapp"))
    precondition(parsePrimeVoiceIntent("Prime, open Notes on another computer") == .none)
    precondition(parsePrimeVoiceIntent("Prime, open Terminal") == .none)
    precondition(parsePrimeVoiceIntent("Prime, run rm -rf") == .none)
    precondition(parsePrimeVoiceIntent("please ask Prime to open Notes") == .none)
    precondition(isPrimeWakePhrase("हे प्राइम, नोट्स खोलो"))
    precondition(parsePrimeVoiceIntent("Prime, Notes kholo") == .open(app: "notes"))
    precondition(parsePrimeVoiceIntent("हे प्राइम, नोट्स खोलो") == .open(app: "notes"))
    precondition(parsePrimeVoiceIntent("Hey Prime, status batao") == .status)
    precondition(parsePrimeVoiceIntent("प्राइम स्टेटस बताओ") == .status)
    precondition(primeSpeechLocalePreference() == ["en-IN", "hi-IN", "en-US"])
    precondition(primeVoiceLanguage(for: "Yes boss. Prime is ready.") == "en-IN")
    precondition(primeVoiceLanguage(for: "जी बॉस, प्राइम तैयार है।") == "hi-IN")

    precondition(approvedAppCommand("Prime open Notes") == "notes")
    precondition(approvedAppCommand("Hey Prime open Notes on another computer") == nil)

    var window = PrimeCommandWindow()
    precondition(window.accept(.wake, at: Date(timeIntervalSince1970: 0)) == .wake)
    precondition(window.accept(.open(app: "notes"), at: Date(timeIntervalSince1970: 7)) == .open(app: "notes"))
    precondition(window.accept(.open(app: "notes"), at: Date(timeIntervalSince1970: 9)) == .none)

    var greetingGate = PrimeGreetingGate()
    let start = Date(timeIntervalSince1970: 0)
    precondition(greetingGate.shouldGreet(at: start))
    precondition(!greetingGate.shouldGreet(at: start.addingTimeInterval(1)))
    greetingGate.recordCommand(at: start.addingTimeInterval(2))
    precondition(!greetingGate.shouldGreet(at: start.addingTimeInterval(15 * 60 + 1)))
    precondition(greetingGate.shouldGreet(at: start.addingTimeInterval(15 * 60 + 3)))

    precondition(primeActionAcknowledgement(.status) == "Yes boss. Checking this Mac's status.")
    precondition(primeActionAcknowledgement(.open(app: "notes")) == "Opening, boss.")
    print("Prime voice command tests passed")
  }
}
