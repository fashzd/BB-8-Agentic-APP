import AppKit
import Foundation

let fileManager = FileManager.default
let projectRoot = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let assetsURL = projectRoot.appendingPathComponent("assets", isDirectory: true)
let iconsetURL = assetsURL.appendingPathComponent("icon.iconset", isDirectory: true)
let icnsURL = assetsURL.appendingPathComponent("icon.icns")

try? fileManager.removeItem(at: iconsetURL)
try? fileManager.removeItem(at: icnsURL)
try fileManager.createDirectory(at: iconsetURL, withIntermediateDirectories: true)

let sourceSize: CGFloat = 1024
let image = NSImage(size: NSSize(width: sourceSize, height: sourceSize))

image.lockFocus()

let background = NSColor(calibratedRed: 15 / 255, green: 18 / 255, blue: 20 / 255, alpha: 1)
background.setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: sourceSize, height: sourceSize)).fill()

let gradient = NSGradient(
  colors: [
    NSColor(calibratedRed: 255 / 255, green: 155 / 255, blue: 37 / 255, alpha: 1),
    NSColor(calibratedRed: 226 / 255, green: 109 / 255, blue: 17 / 255, alpha: 1)
  ]
)!

let inset = sourceSize * 0.11
let cardRect = NSRect(
  x: inset,
  y: inset,
  width: sourceSize - inset * 2,
  height: sourceSize - inset * 2
)

let cardPath = NSBezierPath(roundedRect: cardRect, xRadius: 220, yRadius: 220)
gradient.draw(in: cardPath, angle: -90)

let innerInset = sourceSize * 0.055
let innerRect = cardRect.insetBy(dx: innerInset, dy: innerInset)
let innerPath = NSBezierPath(roundedRect: innerRect, xRadius: 170, yRadius: 170)
NSColor(calibratedRed: 20 / 255, green: 24 / 255, blue: 28 / 255, alpha: 0.92).setFill()
innerPath.fill()

let accentDotRect = NSRect(
  x: cardRect.minX + 90,
  y: cardRect.maxY - 210,
  width: 92,
  height: 92
)
let accentDot = NSBezierPath(ovalIn: accentDotRect)
NSColor(calibratedRed: 255 / 255, green: 163 / 255, blue: 47 / 255, alpha: 1).setFill()
accentDot.fill()

let titleParagraph = NSMutableParagraphStyle()
titleParagraph.alignment = .center

let titleAttributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.boldSystemFont(ofSize: 240),
  .foregroundColor: NSColor.white,
  .paragraphStyle: titleParagraph
]

let subtitleAttributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 118, weight: .semibold),
  .foregroundColor: NSColor(calibratedWhite: 0.78, alpha: 1),
  .paragraphStyle: titleParagraph
]

let title = NSAttributedString(string: "BB-8", attributes: titleAttributes)
let subtitle = NSAttributedString(string: "AI", attributes: subtitleAttributes)

title.draw(in: NSRect(x: 180, y: 470, width: 664, height: 240))
subtitle.draw(in: NSRect(x: 220, y: 290, width: 584, height: 140))

image.unlockFocus()

guard
  let tiffData = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiffData),
  let pngData = bitmap.representation(using: .png, properties: [:])
else {
  fatalError("Could not render app icon.")
}

let sourcePNG = assetsURL.appendingPathComponent("icon-1024.png")
try pngData.write(to: sourcePNG)
try pngData.write(to: assetsURL.appendingPathComponent("icon.png"))

let iconFiles: [(String, Int)] = [
  ("icon_16x16.png", 16),
  ("icon_16x16@2x.png", 32),
  ("icon_32x32.png", 32),
  ("icon_32x32@2x.png", 64),
  ("icon_128x128.png", 128),
  ("icon_128x128@2x.png", 256),
  ("icon_256x256.png", 256),
  ("icon_256x256@2x.png", 512),
  ("icon_512x512.png", 512),
  ("icon_512x512@2x.png", 1024)
]

for (filename, size) in iconFiles {
  guard let resized = NSImage(size: NSSize(width: size, height: size), flipped: false, drawingHandler: { rect in
    image.draw(in: rect)
    return true
  }).tiffRepresentation,
  let resizedBitmap = NSBitmapImageRep(data: resized),
  let resizedPNG = resizedBitmap.representation(using: .png, properties: [:])
  else {
    fatalError("Could not resize icon to \(size)x\(size).")
  }

  try resizedPNG.write(to: iconsetURL.appendingPathComponent(filename))
}

let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconsetURL.path, "-o", icnsURL.path]
try process.run()
process.waitUntilExit()

if process.terminationStatus != 0 {
  fatalError("iconutil failed with status \(process.terminationStatus).")
}

print("Generated \(icnsURL.path)")
