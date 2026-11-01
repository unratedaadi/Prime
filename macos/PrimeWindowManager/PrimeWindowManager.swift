import AppKit
import ApplicationServices

func emit(_ value: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [])
  print(String(data: data, encoding: .utf8)!)
}

func accessibilityTrusted() -> Bool {
  AXIsProcessTrusted()
}

func displays() -> [[String: Any]] {
  let screens = NSScreen.screens
  return screens.enumerated().map { index, screen in
    let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
    return ["id": number?.stringValue ?? String(index), "kind": index == 0 ? "internal" : "external", "name": index == 0 ? "MacBook display" : "External display \(index)", "frame": ["x": screen.frame.origin.x, "y": screen.frame.origin.y, "width": screen.frame.width, "height": screen.frame.height]]
  }
}

func move(appName: String, target: String) {
  guard accessibilityTrusted() else { emit(["ok": false, "code": "accessibility_permission_required"]); return }
  let screens = NSScreen.screens
  let destination: NSScreen?
  if target == "internal" { destination = screens.first } else { destination = screens.dropFirst().first }
  guard let screen = destination else { emit(["ok": false, "code": "external_display_unavailable"]); return }
  guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.google.Chrome").first(where: { $0.localizedName == appName }) ?? NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == appName }) else { emit(["ok": false, "code": "app_not_running"]); return }
  let application = AXUIElementCreateApplication(app.processIdentifier)
  var windows: CFTypeRef?
  guard AXUIElementCopyAttributeValue(application, kAXWindowsAttribute as CFString, &windows) == .success, let list = windows as? [AXUIElement], let window = list.first else { emit(["ok": false, "code": "window_unavailable"]); return }
  let frame = screen.visibleFrame
  var position = CGPoint(x: frame.minX + 40, y: frame.minY + 40)
  var size = CGSize(width: max(400, frame.width - 80), height: max(300, frame.height - 80))
  if let positionValue = AXValueCreate(.cgPoint, &position) { AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, positionValue) }
  if let sizeValue = AXValueCreate(.cgSize, &size) { AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, sizeValue) }
  app.activate(options: [.activateAllWindows])
  emit(["ok": true, "data": ["app": appName, "target": target]])
}

let args = Array(CommandLine.arguments.dropFirst())
guard let action = args.first else { emit(["ok": false, "code": "invalid_request"]); exit(0) }
if action == "displays" { emit(["ok": true, "data": ["displays": displays()]]); exit(0) }
if action == "move", args.count == 3, ["internal", "external"].contains(args[2]) { move(appName: args[1], target: args[2]); exit(0) }
emit(["ok": false, "code": "invalid_request"])
