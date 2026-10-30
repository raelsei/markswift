// Throwaway CI probe: greedy UILabel vs SwiftUI fallback baselines at fractional origins (they must coincide).
import sharp from "sharp";
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const configs = [12, 14, 15, 16, 18, 22].flatMap((s) => [1.3333, 1.5].map((f) => [s, Math.round(s * f * 4) / 4] as [number, number]));
const offsets = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75];
const SLOT = 48, W = 30;
const ratios = (size: number, lh: number) => {
  const a = Math.round((1980 / 2048) * size), d = Math.round((432 / 2048) * size), lead = lh - a - d;
  const below = d + lead - 2 * Math.floor(lead / 2);
  return { a: a / size, below: below / size };
};
const cell = (size: number, lh: number, dy: number, greedy: boolean) => {
  const { a, below } = ratios(size, lh);
  const view = greedy
    ? `MarkswiftGreedyText(text: "H", font: .system(size: ${size}), color: .black, size: ${size}, style: .body, lineHeight: ${lh}, ascent: ${a}, descent: ${below}, natural: 2444.0 / 2048)`
    : `Text(verbatim: "H").font(.system(size: ${size})).foregroundStyle(.black).fixedSize(horizontal: false, vertical: true).markswiftLineHeight(${lh}, size: ${size}, relativeTo: .body, ascent: ${a}, descent: ${below})`;
  return `VStack(alignment: .leading, spacing: 0) { Color.clear.frame(height: ${dy}); ${view} }.frame(width: ${W}, height: ${SLOT}, alignment: .topLeading)`;
};
const rows = configs.map(([s, lh]) =>
  `HStack(alignment: .top, spacing: 0) {\n            ${offsets.flatMap((dy) => [cell(s, lh, dy, true), cell(s, lh, dy, false)]).join("\n            ")}\n        }`,
);
const probe = `import SwiftUI
struct Probe: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ${rows.join("\n            ")}
        }
        .frame(width: ${offsets.length * 2 * W}, alignment: .topLeading)
    }
}
`;
const width = offsets.length * 2 * W, height = configs.length * SLOT;
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
let worst = 0;
for (const [i, [size, lh]] of configs.entries()) {
  const deltas = offsets.map((_, j) => ink(i, j * 2) - ink(i, j * 2 + 1));
  worst = Math.max(worst, ...deltas.map(Math.abs));
  console.log(`size ${size} lh ${lh}: greedy − fallback at offsets ${deltas.map((d) => d.toFixed(3)).join(" ")}`);
}
console.log(`worst |Δ| ${worst.toFixed(3)} pt`);
