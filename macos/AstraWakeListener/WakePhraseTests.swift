import Foundation

@main
struct WakePhraseTests {
  static func main() {
    precondition(isWakePhrase("Prime"))
    precondition(isWakePhrase("Hey Prime"))
    precondition(isWakePhrase("hey-prime!"))
    precondition(isWakePhrase("hey prime open notes"))
    precondition(!isWakePhrase("open hey prime notes"))
    precondition(!isWakePhrase("hey"))
    precondition(approvedAppCommand("Prime, open Notes") == "notes")
    precondition(approvedAppCommand("Hey Prime, open Notes") == "notes")
    precondition(approvedAppCommand("hey prime open Calendar") == "calendar")
    precondition(approvedAppCommand("hey prime open WhatsApp") == "whatsapp")
    precondition(approvedAppCommand("hey prime open Terminal") == nil)
    precondition(approvedAppCommand("open Notes") == nil)
    print("Wake phrase tests passed")
  }
}
