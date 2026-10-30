// Throwaway CI probe: the SwiftUI fallback's drawn baseline over a size × line-height matrix, next to the CSS target
// and the UILabel first-baseline model round3(L − descent), to fit the rule the greedy path must reproduce.
import sharp from "sharp";
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const sizes = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24];
const factors = [1.25, 1.3333, 1.4, 1.5, 1.6, 1.75];
const configs = sizes.flatMap((s) => factors.map((f) => [s, Math.round(s * f * 4) / 4] as [number, number]));
const SLOT = 48;
const ratios = (size: number, lh: number) => {
  const a = Math.round((1980 / 2048) * size), d = Math.round((432 / 2048) * size), lead = lh - a - d;
  const below = d + lead - 2 * Math.floor(lead / 2);
  return { a: a / size, below: below / size, css: (lh + a - below) / 2 };
};
const slots = configs.map(([size, lh]) => {
  const { a, below } = ratios(size, lh);
  return `Text(verbatim: "H").font(.system(size: ${size})).foregroundStyle(.black).fixedSize(horizontal: false, vertical: true)
                .markswiftLineHeight(${lh}, size: ${size}, relativeTo: .body, ascent: ${a}, descent: ${below})
                .frame(width: 60, height: ${SLOT}, alignment: .topLeading)`;
});
const COLS = factors.length, W = 60;
const rowsSwift = sizes.map((_, r) => `HStack(alignment: .top, spacing: 0) {\n            ${slots.slice(r * COLS, (r + 1) * COLS).join("\n            ")}\n        }`);
const probe = `import SwiftUI
struct Probe: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ${rowsSwift.join("\n            ")}
        }
        .frame(width: ${COLS * W}, alignment: .topLeading)
    }
}
`;
const height = sizes.length * SLOT;
const result = {
  name: "Probe",
  files: { "Probe.swift": probe, "MarkswiftRuntime.swift": SWIFT_RUNTIME },
  assets: {},
  layout: { size: { w: COLS * W, h: height }, canvas: "white", combo: { screen: "probe", theme: "light" } },
} as unknown as RenderResult;
const out = "/tmp/markswift-sf.png";
const device = await ensureSimulator();
const errors = await renderIos([{ result, output: out }], "/tmp/markswift-sf-work", device.udid);
console.log("render errors:", [...errors.values()]);
const { data, info } = await sharp(await sharp(out).withIccProfile("srgb").png().toBuffer())
  .greyscale().raw().toBuffer({ resolveWithObject: true });
const scale = info.height / height;
const r3 = (v: number) => Math.round(v * 3) / 3;
for (const [i, [size, lh]] of configs.entries()) {
  const top = Math.floor(i / COLS) * SLOT * scale, left = (i % COLS) * W * scale, h = SLOT * scale;
  let col = left, best = 0;
  for (let x = left; x < left + 30 * scale; x++) { let s = 0; for (let y = top; y < top + h; y++) s += 255 - data[y * info.width + x]!; if (s > best) { best = s; col = x; } }
  const rows = Array.from({ length: h }, (_, k) => (255 - data[(top + k) * info.width + col]!) / 255);
  const first = rows.findIndex((d) => d > 0.5), last = rows.length - 1 - [...rows].reverse().findIndex((d) => d > 0.5);
  const mid = Math.floor((first + last) / 2);
  let sum = 0; for (let k = mid; k < rows.length; k++) sum += rows[k]!;
  const ink = (mid + sum) / scale;
  const desc = (494 / 2048) * size;
  console.log(`CSV,${size},${lh},${ink.toFixed(3)},${ratios(size, lh).css},${r3(lh - desc).toFixed(3)}`);
}
