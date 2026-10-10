import type { ConversionResult } from "../../src/index.ts";
import { parseColor } from "../../src/css/color.ts";

export const packageManifest = `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "MarkswiftPreview",
    platforms: [.iOS("18.0")],
    products: [.library(name: "Generated", targets: ["Generated"])],
    targets: [
        .target(name: "Generated", resources: [.copy("Fonts")]),
        .testTarget(name: "PreviewTests", dependencies: ["Generated"])
    ]
)
`;

export function renderTest(result: ConversionResult, output: string): string {
  const { w, h } = result.layout.size;
  if (![w, h].every(n => Number.isFinite(n) && n > 0 && n <= 4096)) {
    throw new Error("Measured component size must be 1–4096 px; constrain the HTML width/height.");
  }
  const color = parseColor(result.layout.canvas) ?? { r: 1, g: 1, b: 1, a: 1 };
  return `import XCTest
import SwiftUI
@testable import Generated

final class PreviewTests: XCTestCase {
    @MainActor
    func testSnapshot() throws {
        let fontDirectory = MarkswiftPreviewResources.bundle.bundleURL.appendingPathComponent("Fonts")
        let fonts = try FileManager.default.contentsOfDirectory(at: fontDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "ttf" || $0.pathExtension == "otf" }
        MarkswiftFonts.register(urls: fonts)
        let content = ${result.name}()
            .frame(width: ${w}, height: ${h}, alignment: .topLeading)
            .background(Color(.sRGB, red: ${color.r}, green: ${color.g}, blue: ${color.b}, opacity: ${color.a}))
            .environment(\\.colorScheme, .${result.layout.combo.theme === "dark" ? "dark" : "light"})
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        renderer.proposedSize = ProposedViewSize(width: ${w}, height: ${h})
        let image = try XCTUnwrap(renderer.uiImage, "SwiftUI produced no image")
        let data = try XCTUnwrap(image.pngData())
        try data.write(to: URL(fileURLWithPath: ${JSON.stringify(output)}))
    }
}
`;
}
