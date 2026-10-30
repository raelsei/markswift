// Throwaway CI probe: first-line baseline of the runtime MarkswiftGreedyText vs the SwiftUI fallback, one line and two.
import sharp from "sharp";
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const configs: Array<[number, number]> = [[12, 16], [12, 18], [14, 20], [14, 21], [15, 22.5], [16, 24], [18, 27], [22, 33]];
const offsets = [0, 0.25, 0.5];
const texts = ["H", "H H"];
const SLOT = 80, W = 22;
const ratios = (size: number, lh: number) => {
  const a = Math.round((1980 / 2048) * size), d = Math.round((432 / 2048) * size), lead = lh - a - d;
  const below = d + lead - 2 * Math.floor(lead / 2);
  return { a: a / size, below: below / size };
};
// "H H" in a 22 pt column wraps to two lines in both paths.
const cell = (size: number, lh: number, dy: number, text: string, greedy: boolean) => {
  const { a, below } = ratios(size, lh);
  const view = greedy
    ? `MarkswiftGreedyText(text: "${text}", font: .system(size: ${size}, weight: .regular, design: .default), color: .black, size: ${size}, style: .body, lineHeight: ${lh}, ascent: ${a}, descent: ${below}, natural: 2444.0 / 2048)`
    : `Text(verbatim: "${text}").font(.system(size: ${size}, weight: .regular, design: .default)).foregroundStyle(.black).fixedSize(horizontal: false, vertical: true).markswiftLineHeight(${lh}, size: ${size}, relativeTo: .body, ascent: ${a}, descent: ${below}).frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)`;
  return `VStack(alignment: .leading, spacing: 0) { Color.clear.frame(height: ${dy}); ${view} }.frame(width: ${W}, height: ${SLOT}, alignment: .topLeading)`;
};
const cols: Array<[number, string, boolean]> = offsets.flatMap((dy) => texts.flatMap((t) => [true, false].map((g) => [dy, t, g] as [number, string, boolean])));
const rows = configs.map(([s, lh]) => `HStack(alignment: .top, spacing: 0) {\n            ${cols.map(([dy, t, g]) => cell(s, lh, dy, t, g)).join("\n            ")}\n        }`);
const probe = `import SwiftUI
struct Probe: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ${rows.join("\n            ")}
        }
        .frame(width: ${cols.length * W}, alignment: .topLeading)
    }
}
`;
const width = cols.length * W, height = configs.length * SLOT;
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
/** Bottom edge of the first ink run down the darkest column: the first line's baseline. Also the line count. */
const firstLine = (row: number, col: number) => {
  const top = row * SLOT * scale, left = col * W * scale, h = SLOT * scale;
  let c = left, best = 0;
  for (let x = left; x < left + 14 * scale; x++) { let s = 0; for (let y = top; y < top + h; y++) s += 255 - data[y * info.width + x]!; if (s > best) { best = s; c = x; } }
  const r = Array.from({ length: h }, (_, k) => (255 - data[(top + k) * info.width + c]!) / 255);
  let k = r.findIndex((d) => d > 0.5);
  while (k < r.length && r[k]! > 0.5) k++;
  let runs = 0; for (let i = 1; i < r.length; i++) if (r[i]! > 0.5 && r[i - 1]! <= 0.5) runs++;
  return { base: (k + (r[k] ?? 0)) / scale, lines: runs };
};
for (const [i, [size, lh]] of configs.entries()) {
  const parts = cols.map(([dy, t, g], j) => ({ dy, t, g, ...firstLine(i, j) }));
  const out: string[] = [];
  for (const dy of offsets) for (const t of texts) {
    const g = parts.find((p) => p.dy === dy && p.t === t && p.g)!, f = parts.find((p) => p.dy === dy && p.t === t && !p.g)!;
    out.push(`${t === "H" ? "1" : "2"}L@${dy}: ${(g.base - f.base).toFixed(2)}${g.lines !== f.lines ? `(lines ${g.lines}/${f.lines})` : ""}`);
  }
  console.log(`size ${size} lh ${lh}: ${out.join("  ")}`);
}
