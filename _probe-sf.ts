// Throwaway CI probe: two baseline-offset formulas for the greedy UILabel against the SwiftUI fallback at fractional
// origins. A: L − d − css (exact descent). B: round₍scale₎(L − d) − css.
import sharp from "sharp";
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const configs = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24].flatMap((s) =>
  [1.3333, 1.5, 1.4].map((f) => [s, Math.round(s * f * 4) / 4] as [number, number]),
);
const offsets = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75];
const SLOT = 44, W = 22;
const ratios = (size: number, lh: number) => {
  const a = Math.round((1980 / 2048) * size), d = Math.round((432 / 2048) * size), lead = lh - a - d;
  const below = d + lead - 2 * Math.floor(lead / 2);
  return { a: a / size, below: below / size };
};
const cell = (size: number, lh: number, dy: number, kind: "A" | "B" | "F") => {
  const { a, below } = ratios(size, lh);
  const view =
    kind === "F"
      ? `Text(verbatim: "H").font(.system(size: ${size})).foregroundStyle(.black).fixedSize(horizontal: false, vertical: true).markswiftLineHeight(${lh}, size: ${size}, relativeTo: .body, ascent: ${a}, descent: ${below})`
      : `ProbeGreedy(size: ${size}, lineHeight: ${lh}, ascent: ${a}, descent: ${below}, rounded: ${kind === "B"})`;
  return `VStack(alignment: .leading, spacing: 0) { Color.clear.frame(height: ${dy}); ${view} }.frame(width: ${W}, height: ${SLOT}, alignment: .topLeading)`;
};
const KINDS = ["A", "B", "F"] as const;
const rows = configs.map(([s, lh]) =>
  `HStack(alignment: .top, spacing: 0) {\n            ${offsets.flatMap((dy) => KINDS.map((k) => cell(s, lh, dy, k))).join("\n            ")}\n        }`,
);
const probe = `import SwiftUI
import UIKit
struct ProbeGreedy: UIViewRepresentable {
    let size: CGFloat, lineHeight: CGFloat, ascent: CGFloat, descent: CGFloat, rounded: Bool
    func makeUIView(context: Context) -> UILabel { UILabel() }
    func updateUIView(_ label: UILabel, context: Context) {
        let font = UIFont.systemFont(ofSize: size)
        let paragraph = NSMutableParagraphStyle(); paragraph.minimumLineHeight = lineHeight; paragraph.maximumLineHeight = lineHeight
        let scale = context.environment.displayScale
        let css = (lineHeight / size + ascent - descent) * size / 2
        let native = lineHeight - CTFontGetDescent(font as CTFont)
        let offset = (rounded ? (native * scale).rounded() / scale : native) - css
        label.attributedText = NSAttributedString(string: "H", attributes: [.font: font, .foregroundColor: UIColor.black, .paragraphStyle: paragraph, .baselineOffset: offset])
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        uiView.sizeThatFits(CGSize(width: proposal.width ?? .greatestFiniteMagnitude, height: .greatestFiniteMagnitude))
    }
}
struct Probe: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ${rows.join("\n            ")}
        }
        .frame(width: ${offsets.length * KINDS.length * W}, alignment: .topLeading)
    }
}
`;
const width = offsets.length * KINDS.length * W, height = configs.length * SLOT;
const result = {
  name: "Probe",
  files: { "Probe.swift": probe, "MarkswiftRuntime.swift": SWIFT_RUNTIME },
  assets: {},
  layout: { size: { w: width, h: height }, canvas: "white", combo: { screen: "probe", theme: "light" } },
} as unknown as RenderResult;
const out = "/tmp/markswift-sf.png";
const device = await ensureSimulator();
const errors = await renderIos([{ result, output: out }], "/tmp/markswift-sf-work", device.udid);
console.log("render errors:", [...errors.values()]);
const { data, info } = await sharp(await sharp(out).withIccProfile("srgb").png().toBuffer())
  .greyscale().raw().toBuffer({ resolveWithObject: true });
const scale = info.height / height;
const ink = (row: number, col: number) => {
  const top = row * SLOT * scale, left = col * W * scale, h = SLOT * scale;
  let c = left, best = 0;
  for (let x = left; x < left + W * scale; x++) { let s = 0; for (let y = top; y < top + h; y++) s += 255 - data[y * info.width + x]!; if (s > best) { best = s; c = x; } }
  const r = Array.from({ length: h }, (_, k) => (255 - data[(top + k) * info.width + c]!) / 255);
  const first = r.findIndex((d) => d > 0.5), last = r.length - 1 - [...r].reverse().findIndex((d) => d > 0.5);
  const mid = Math.floor((first + last) / 2);
  let sum = 0; for (let k = mid; k < r.length; k++) sum += r[k]!;
  return (mid + sum) / scale;
};
const worst = { A: 0, B: 0 };
for (const [i, [size, lh]] of configs.entries()) {
  const d = (k: number) => offsets.map((_, j) => ink(i, j * 3 + k) - ink(i, j * 3 + 2));
  const a = d(0), b = d(1);
  worst.A = Math.max(worst.A, ...a.map(Math.abs)); worst.B = Math.max(worst.B, ...b.map(Math.abs));
  console.log(`size ${size} lh ${lh}: A ${a.map((v) => v.toFixed(2)).join(" ")} | B ${b.map((v) => v.toFixed(2)).join(" ")}`);
}
console.log(`worst |Δ| A ${worst.A.toFixed(3)} B ${worst.B.toFixed(3)}`);
