// Throwaway CI probe: where the greedy UILabel path and the SwiftUI fallback put a system-font baseline, measured in the
// render app's own PNG, against the CSS baseline text.ts targets.
import sharp from "sharp";
import { ensureSimulator, renderIos } from "./tools/verify/native.ts";
import { SWIFT_RUNTIME } from "./src/swift/runtime.ts";
import type { RenderResult } from "./tools/verify/native-template.ts";

const configs: Array<[number, number]> = [[14, 24], [16, 24], [16, 28], [18, 28], [15, 22.5], [17, 26]];
const SLOT = 40;
const ratios = (size: number, lh: number) => {
  const a = Math.round((1980 / 2048) * size), d = Math.round((432 / 2048) * size), lead = lh - a - d;
  const below = d + lead - 2 * Math.floor(lead / 2);
  return { a: a / size, below: below / size, css: (lh / size + a / size - below / size) * size / 2 };
};
const slots = configs.flatMap(([size, lh]) => {
  const { a, below } = ratios(size, lh);
  return [
    `MarkswiftGreedyText(text: "H", font: .system(size: ${size}), color: .black, size: ${size}, style: .body, lineHeight: ${lh}, ascent: ${a}, descent: ${below}, natural: 2444.0 / 2048)
                .frame(width: 200, height: ${SLOT}, alignment: .topLeading)`,
    `Text(verbatim: "H").font(.system(size: ${size})).foregroundStyle(.black).fixedSize(horizontal: false, vertical: true)
                .markswiftLineHeight(${lh}, size: ${size}, relativeTo: .body, ascent: ${a}, descent: ${below})
                .frame(width: 200, height: ${SLOT}, alignment: .topLeading)`,
  ];
});
const probe = `import SwiftUI
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
const device = await ensureSimulator();
const errors = await renderIos([{ result, output: out }], "/tmp/markswift-sf-work", device.udid);
console.log("render errors:", [...errors.values()]);
const { data, info } = await sharp(await sharp(out).withIccProfile("srgb").png().toBuffer())
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });
const scale = info.height / height;
for (const [i, [size, lh]] of configs.entries()) {
  for (const [j, path] of ["greedy UILabel", "SwiftUI fallback"].entries()) {
    const top = (i * 2 + j) * SLOT * scale;
    let bottom = -1;
    for (let y = top; y < top + SLOT * scale; y++)
      for (let x = 0; x < info.width; x++) if (data[y * info.width + x]! < 128) { bottom = y; break; }
    const baseline = (bottom + 1 - top) / scale;
    console.log(
      `size ${size} lh ${lh} ${path.padEnd(16)} ink bottom ${baseline.toFixed(3)} pt, css ${ratios(size, lh).css.toFixed(3)} pt, Δ ${(baseline - ratios(size, lh).css).toFixed(3)}`,
    );
  }
}
