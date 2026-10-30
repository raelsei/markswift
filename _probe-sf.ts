// Throwaway CI probe: does TextKit 2 (or firstBaselineAnchor) predict where UILabel draws a fixed-height paragraph's
// baseline? Ink is measured in the render app's PNG; predictions are logged by the views.
import sharp from "sharp";
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const configs: Array<[number, number]> = [
  [12, 16], [12, 18], [13, 20], [14, 20], [14, 21], [15, 22.5], [15, 23], [16, 24], [16, 26], [17, 26], [18, 27], [20, 28], [22, 33],
];
const SLOT = 40;
const slots = configs.map(([size, lh]) => `ProbeLabel(size: ${size}, lineHeight: ${lh}).frame(width: 200, height: ${SLOT}, alignment: .topLeading)`);
const probe = `import SwiftUI
import UIKit

private func log(_ line: String) {
    if let h = FileHandle(forWritingAtPath: "/tmp/markswift-sf.txt") { h.seekToEndOfFile(); h.write((line + "\\n").data(using: .utf8)!); h.closeFile() }
}
final class ProbeUILabel: UILabel {
    var size: CGFloat = 0, lineHeight: CGFloat = 0, logged = false
    override func layoutSubviews() {
        super.layoutSubviews()
        guard !logged, bounds.width > 0, let text = attributedText else { return }
        logged = true
        // TextKit 2 over the same attributed string.
        let storage = NSTextContentStorage(); storage.attributedString = text
        let manager = NSTextLayoutManager(); storage.addTextLayoutManager(manager)
        let container = NSTextContainer(size: CGSize(width: bounds.width, height: 0)); container.lineFragmentPadding = 0
        manager.textContainer = container
        manager.ensureLayout(for: manager.documentRange)
        var tk2: CGFloat = -1
        manager.enumerateTextLayoutFragments(from: manager.documentRange.location, options: [.ensuresLayout]) { fragment in
            if let line = fragment.textLineFragments.first { tk2 = fragment.layoutFragmentFrame.minY + line.typographicBounds.minY + line.glyphOrigin.y }
            return false
        }
        // Auto Layout's first baseline.
        let probe = UIView(); probe.translatesAutoresizingMaskIntoConstraints = false; addSubview(probe)
        NSLayoutConstraint.activate([probe.topAnchor.constraint(equalTo: firstBaselineAnchor), probe.leadingAnchor.constraint(equalTo: leadingAnchor), probe.widthAnchor.constraint(equalToConstant: 1), probe.heightAnchor.constraint(equalToConstant: 1)])
        layoutIfNeeded()
        let anchor = probe.frame.minY; probe.removeFromSuperview()
        let font = UIFont.systemFont(ofSize: size)
        log("size \\(size) lh \\(lineHeight) tk2 \\(tk2) anchor \\(anchor) desc \\(font.descender) scale \\(window?.screen.scale ?? 0)")
    }
}
struct ProbeLabel: UIViewRepresentable {
    let size: CGFloat, lineHeight: CGFloat
    func makeUIView(context: Context) -> ProbeUILabel {
        let label = ProbeUILabel(); label.size = size; label.lineHeight = lineHeight; label.numberOfLines = 0
        let paragraph = NSMutableParagraphStyle(); paragraph.minimumLineHeight = lineHeight; paragraph.maximumLineHeight = lineHeight
        paragraph.lineBreakMode = .byWordWrapping; paragraph.lineBreakStrategy = []
        label.attributedText = NSAttributedString(string: "H", attributes: [.font: UIFont.systemFont(ofSize: size), .paragraphStyle: paragraph, .foregroundColor: UIColor.black])
        return label
    }
    func updateUIView(_ label: ProbeUILabel, context: Context) {}
}
struct Probe: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ${slots.join("\n            ")}
        }
        .frame(width: 200, alignment: .topLeading)
    }
}
`;
const height = slots.length * SLOT;
const result = {
  name: "Probe",
  files: { "Probe.swift": probe, "MarkswiftRuntime.swift": SWIFT_RUNTIME },
  assets: {},
  layout: { size: { w: 200, h: height }, canvas: "white", combo: { screen: "probe", theme: "light" } },
} as unknown as RenderResult;
const out = "/tmp/markswift-sf.png";
await Bun.write("/tmp/markswift-sf.txt", "");
const device = await ensureSimulator();
const errors = await renderIos([{ result, output: out }], "/tmp/markswift-sf-work", device.udid);
console.log("render errors:", [...errors.values()]);
const logs = (await Bun.file("/tmp/markswift-sf.txt").text()).trim().split("\n");
const { data, info } = await sharp(await sharp(out).withIccProfile("srgb").png().toBuffer())
  .greyscale().raw().toBuffer({ resolveWithObject: true });
const scale = info.height / height;
for (const [i, [size, lh]] of configs.entries()) {
  const top = i * SLOT * scale, h = SLOT * scale;
  let col = 0, best = 0;
  for (let x = 0; x < 40 * scale; x++) { let s = 0; for (let y = top; y < top + h; y++) s += 255 - data[y * info.width + x]!; if (s > best) { best = s; col = x; } }
  const rows = Array.from({ length: h }, (_, k) => (255 - data[(top + k) * info.width + col]!) / 255);
  const first = rows.findIndex((d) => d > 0.5), last = rows.length - 1 - [...rows].reverse().findIndex((d) => d > 0.5);
  const mid = Math.floor((first + last) / 2);
  let sum = 0; for (let k = mid; k < rows.length; k++) sum += rows[k]!;
  const ink = (mid + sum) / scale;
  console.log(`size ${size} lh ${lh}: ink ${ink.toFixed(3)} | ${logs.find((l) => l.startsWith(`size ${size}.0 lh ${lh}`) || l.startsWith(`size ${size} lh ${lh}`)) ?? "no log"}`);
}
