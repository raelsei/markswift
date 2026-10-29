// Throwaway CI probe: iOS SF metrics and where the greedy UILabel and the SwiftUI fallback put the baseline.
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const probe = `import SwiftUI
import UIKit

private func log(_ line: String) {
    if let h = FileHandle(forWritingAtPath: "/tmp/markswift-sf.txt") { h.seekToEndOfFile(); h.write((line + "\\n").data(using: .utf8)!); h.closeFile() }
}
/// Lowest row with ink in a rendered view: the baseline of a glyph without a descender.
@MainActor private func inkBottom(_ view: UIView, scale: CGFloat) -> CGFloat {
    let format = UIGraphicsImageRendererFormat(); format.scale = scale
    let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in view.drawHierarchy(in: view.bounds, afterScreenUpdates: true) }
    guard let cg = image.cgImage, let data = cg.dataProvider?.data, let p = CFDataGetBytePtr(data) else { return -1 }
    let bpr = cg.bytesPerRow, bpp = cg.bitsPerPixel / 8
    var bottom = -1
    for y in 0..<cg.height { for x in 0..<cg.width { if p[y * bpr + x * bpp] < 128 { bottom = y; break } } }
    return CGFloat(bottom + 1) / scale
}
struct Probe: View {
    var body: some View {
        Color.white.onAppear { MainActor.assumeIsolated {
            guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first?.windows.first else { return }
            for (size, lineHeight) in [(14.0, 24.0), (16.0, 24.0), (16.0, 28.0), (18.0, 28.0)] as [(CGFloat, CGFloat)] {
                let ui = UIFont.systemFont(ofSize: size)
                let ct = ui as CTFont
                log("size \\(size) lh \\(lineHeight): UIFont asc \\(ui.ascender) desc \\(ui.descender) leading \\(ui.leading) lineHeight \\(ui.lineHeight); CT asc \\(CTFontGetAscent(ct)) desc \\(CTFontGetDescent(ct)) leading \\(CTFontGetLeading(ct)) upem \\(CTFontGetUnitsPerEm(ct))")
                // CSS baseline from the top with Chrome's macOS SF ratios, as text.ts emits them.
                let a = (0.966796875 * size).rounded(), d = (0.2109375 * size).rounded(), lead = lineHeight - a - d
                let below = d + lead - 2 * (lead / 2).rounded(.down)
                let css = (lineHeight / size + a / size - below / size) * size / 2
                for scale in [2.0, 3.0] as [CGFloat] {
                    // Greedy label without baselineOffset: where UIKit puts the baseline on its own.
                    let label = UILabel(frame: CGRect(x: 0, y: 0, width: 200, height: lineHeight))
                    let paragraph = NSMutableParagraphStyle(); paragraph.minimumLineHeight = lineHeight; paragraph.maximumLineHeight = lineHeight
                    label.attributedText = NSAttributedString(string: "H", attributes: [.font: ui, .paragraphStyle: paragraph])
                    label.backgroundColor = .white; window.addSubview(label); label.layoutIfNeeded()
                    let uikit = inkBottom(label, scale: scale); label.removeFromSuperview()
                    // SwiftUI fallback as generated.
                    let host = UIHostingController(rootView: Text("H").font(.system(size: size)).foregroundStyle(.black)
                        .fixedSize(horizontal: false, vertical: true)
                        .markswiftLineHeight(lineHeight, size: size, relativeTo: .body, ascent: a / size, descent: below / size)
                        .frame(width: 200, alignment: .topLeading).background(.white))
                    host.safeAreaRegions = []; host.view.frame = CGRect(x: 0, y: 0, width: 200, height: 80); window.addSubview(host.view); host.view.layoutIfNeeded()
                    let swiftui = inkBottom(host.view, scale: scale); host.view.removeFromSuperview()
                    log("  scale \\(scale): css baseline \\(css), UILabel ink bottom \\(uikit) (L - |CT desc| = \\(lineHeight - CTFontGetDescent(ct))), SwiftUI fallback ink bottom \\(swiftui)")
                }
            }
        } }
    }
}
`;
const result = {
  name: "Probe",
  files: { "Probe.swift": probe, "MarkswiftRuntime.swift": SWIFT_RUNTIME },
  assets: {},
  layout: { size: { w: 200, h: 120 }, canvas: "white", combo: { screen: "probe", theme: "light" } },
} as unknown as RenderResult;
await Bun.write("/tmp/markswift-sf.txt", "");
const device = await ensureSimulator();
const errors = await renderIos([{ result, output: "/tmp/markswift-sf.png" }], "/tmp/markswift-sf-work", device.udid);
console.log("render errors:", [...errors.values()]);
await Bun.sleep(3000);
console.log(await Bun.file("/tmp/markswift-sf.txt").text());
