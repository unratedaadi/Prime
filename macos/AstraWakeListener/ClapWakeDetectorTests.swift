import AVFoundation
import Foundation

@main
struct ClapWakeDetectorTests {
  static func main() {
    let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    let clap = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 8)!
    clap.frameLength = 8
    clap.floatChannelData!.pointee[0] = 0.9

    var detector = ClapWakeDetector()
    let start = Date(timeIntervalSince1970: 0)
    precondition(!detector.ingest(clap, at: start))
    precondition(detector.ingest(clap, at: start.addingTimeInterval(0.25)))
    print("Clap wake detector tests passed")
  }
}
