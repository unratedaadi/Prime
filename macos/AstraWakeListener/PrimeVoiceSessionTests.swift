import Foundation

@main
struct PrimeVoiceSessionTests {
  static func main() {
    let now = Date(timeIntervalSince1970: 100)
    var session = PrimeVoiceSession()
    precondition(session.accept("open Notes", isFinal: true, at: now) == .ignored)
    precondition(session.accept("Hey Prime", isFinal: false, at: now) == .ignored)
    precondition(session.accept("Hey Prime", isFinal: true, at: now) == .ready)
    precondition(session.accept("open Notes", isFinal: true, at: now.addingTimeInterval(2)) == .command("open Notes"))
    precondition(session.accept("open Safari", isFinal: true, at: now.addingTimeInterval(3)) == .ignored)
    precondition(session.accept("Prime, search for C++ & Swift", isFinal: true, at: now.addingTimeInterval(10)) == .command("search for C++ & Swift"))
    precondition(session.accept("Prime, search for C++ & Swift", isFinal: true, at: now.addingTimeInterval(11)) == .ignored)
    precondition(session.accept("Hey Prime", isFinal: true, at: now.addingTimeInterval(20)) == .ready)
    precondition(session.accept("open Notes", isFinal: true, at: now.addingTimeInterval(40)) == .ignored)
    precondition(session.accept("Prime", isFinal: true, at: now.addingTimeInterval(50)) == .ready)
    precondition(session.accept("cancel", isFinal: true, at: now.addingTimeInterval(51)) == .cancelled)
    precondition(session.accept("open Notes", isFinal: true, at: now.addingTimeInterval(52)) == .ignored)
    precondition(session.accept("please ask Prime later", isFinal: true, at: now.addingTimeInterval(53)) == .ignored)
    precondition(session.accept("हे प्राइम, नोट्स खोलो", isFinal: true, at: now.addingTimeInterval(60)) == .command("नोट्स खोलो"))
    session.openFollowUp(at: now.addingTimeInterval(70))
    precondition(session.accept("yes", isFinal: true, at: now.addingTimeInterval(72)) == .command("yes"))
    session.openFollowUp(at: now.addingTimeInterval(80))
    session.cancel()
    precondition(session.accept("yes", isFinal: true, at: now.addingTimeInterval(81)) == .ignored)
    print("Prime voice session tests passed")
  }
}
