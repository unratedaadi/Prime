import AVFoundation
import Foundation

struct ClapWakeDetector {
  private var claps: [Date] = []
  private var lastClap = Date.distantPast

  mutating func ingest(_ buffer: AVAudioPCMBuffer, at now: Date = Date()) -> Bool {
    guard let channel = buffer.floatChannelData?.pointee else { return false }
    let peak = (0..<Int(buffer.frameLength)).reduce(Float.zero) { max($0, abs(channel[$1])) }
    guard peak >= 0.78, now.timeIntervalSince(lastClap) >= 0.16 else { return false }
    lastClap = now
    claps.append(now)
    claps.removeAll { now.timeIntervalSince($0) > 1.5 }
    guard claps.count >= 2 else { return false }
    claps.removeAll()
    return true
  }
}
