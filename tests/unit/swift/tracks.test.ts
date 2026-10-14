import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { solveTracks } from "../../../src/analysis/grid-tracks.ts";
import type { GridTemplate, GridTrack } from "../../../src/model/semantic.ts";
import tracksRuntime from "../../../src/swift/runtime/tracks.swift" with { type: "text" };
import { command } from "../../../tools/verify/process.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  "tracks runtime implements SwiftUI Layout for tracks, auto-repeat and fractions",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-tracks-typecheck-"));
    try {
      await Bun.write(
        join(directory, "TracksFixture.swift"),
        `import SwiftUI\n\n${tracksRuntime}\n
struct TracksFixture: View {
    var body: some View {
        VStack {
            MarkswiftTracks(tracks: [.px(100), .fr(1, min: 120), .auto], hSpacing: 8, vSpacing: 8) {
                Color.red.frame(maxWidth: .infinity, maxHeight: .infinity)
                Color.blue.frame(maxWidth: .infinity, maxHeight: .infinity)
                Text("auto").frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            MarkswiftTracks(autoRepeat: .fit(min: 160), hSpacing: 8, vSpacing: 8, stretch: false) {
                Color.green.frame(maxWidth: .infinity)
                Color.yellow.frame(maxWidth: .infinity)
            }
            Color.red.frame(maxWidth: .infinity).markswiftFraction(0.75)
        }
        .frame(width: 390)
    }
}
`,
      );
      const check = await typecheck(directory);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);

const px = (n: number): GridTrack => ({ kind: "px", px: n });
const fr = (n: number, min?: number): GridTrack => ({ kind: "fr", fr: n, ...(min === undefined ? {} : { min }) });
const auto: GridTrack = { kind: "auto" };
const CASES: Array<{ t: GridTemplate; width: number; gap: number; count: number; autoWidths: number[] }> = [
  { t: { tracks: [fr(1), fr(2)] }, width: 348, gap: 10, count: 2, autoWidths: [] },
  { t: { tracks: [px(100), fr(1)] }, width: 274, gap: 8, count: 2, autoWidths: [] },
  { t: { tracks: [auto, fr(1), auto] }, width: 300, gap: 8, count: 3, autoWidths: [40, 0, 36] },
  { t: { tracks: [], autoRepeat: { mode: "fill", min: 100 } }, width: 345, gap: 8, count: 6, autoWidths: [] },
  { t: { tracks: [], autoRepeat: { mode: "fill", min: 100 } }, width: 200, gap: 8, count: 6, autoWidths: [] },
  { t: { tracks: [], autoRepeat: { mode: "fill", min: 100 } }, width: 90, gap: 8, count: 6, autoWidths: [] },
  { t: { tracks: [], autoRepeat: { mode: "fit", min: 160 } }, width: 700, gap: 8, count: 2, autoWidths: [] },
  { t: { tracks: [], autoRepeat: { mode: "fit", min: 160 } }, width: 700, gap: 8, count: 5, autoWidths: [] },
  { t: { tracks: [px(200), px(200)] }, width: 300, gap: 10, count: 2, autoWidths: [] },
  { t: { tracks: [fr(1.5), px(50), fr(0.5)] }, width: 400, gap: 12, count: 3, autoWidths: [] },
  // core-alpha #minimum (64px minmax(100px,1fr) minmax(0,2fr), gap 12) at 390 / 320 / 500, and its fr sum < 1 case.
  ...[358, 288, 468].map((width) => ({
    t: { tracks: [px(64), fr(1, 100), fr(2)] },
    width,
    gap: 12,
    count: 3,
    autoWidths: [],
  })),
  { t: { tracks: [fr(0.2), fr(0.3)] }, width: 300, gap: 0, count: 2, autoWidths: [] },
  { t: { tracks: [fr(1, 200), fr(1, 200)] }, width: 300, gap: 10, count: 2, autoWidths: [] }, // floors overflow
];

test("solveTracks freezes minmax(px, fr) floors and keeps the unused share of an fr sum below 1", () => {
  const r3 = (w: number[]) => w.map((v) => Math.round(v * 1000) / 1000);
  const minimum = { tracks: [px(64), fr(1, 100), fr(2)] };
  expect(solveTracks(minimum, 358, 12, 3, [])).toEqual([64, 100, 170]);
  expect(solveTracks(minimum, 288, 12, 3, [])).toEqual([64, 100, 100]);
  expect(r3(solveTracks(minimum, 468, 12, 3, []))).toEqual([64, 126.667, 253.333]);
  expect(solveTracks({ tracks: [px(80), fr(1, 100), fr(2)] }, 300, 0, 3, [])).toEqual([80, 100, 120]);
  expect(r3(solveTracks({ tracks: [fr(0.2), fr(0.3)] }, 300, 0, 2, []))).toEqual([60, 90]);
  expect(solveTracks({ tracks: [fr(1, 200), fr(1, 200)] }, 300, 10, 2, [])).toEqual([200, 200]);
});

function swiftCall({ t, width, gap, count, autoWidths }: (typeof CASES)[number]): string {
  const tracks = t.tracks.map((k) =>
    k.kind === "auto" ? ".auto" : k.kind === "px" ? `.px(${k.px})` : `.fr(${k.fr}${k.min ? `, min: ${k.min}` : ""})`,
  );
  const repeat = t.autoRepeat ? `.${t.autoRepeat.mode}(min: ${t.autoRepeat.min})` : "nil";
  return `MarkswiftTracks.columns(width: ${width}, tracks: [${tracks.join(", ")}], autoRepeat: ${repeat}, count: ${count}, spacing: ${gap}, autoWidths: [${autoWidths.join(", ")}])`;
}

nativeTest(
  "MarkswiftTracks.columns agrees with solveTracks",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-tracks-parity-"));
    try {
      await Bun.write(join(directory, "tracks.swift"), `import SwiftUI\n\n${tracksRuntime}`);
      await Bun.write(
        join(directory, "main.swift"),
        `import SwiftUI\n\nlet results: [[CGFloat]] = [\n${CASES.map((c) => `    ${swiftCall(c)},`).join("\n")}\n]\nfor cols in results { print("[" + cols.map { "\\(Double($0))" }.joined(separator: ",") + "]") }\n`,
      );
      const sdk = (await command(["xcrun", "--sdk", "macosx", "--show-sdk-path"], undefined, 15_000)).trim();
      await command(
        [
          "xcrun",
          "swiftc",
          "-sdk",
          sdk,
          "-target",
          "arm64-apple-macos15.0",
          "-swift-version",
          "6",
          "-strict-concurrency=complete",
          "-default-isolation",
          "MainActor",
          "-o",
          join(directory, "parity"),
          join(directory, "tracks.swift"),
          join(directory, "main.swift"),
        ],
        directory,
        240_000,
      );
      const lines = (await command([join(directory, "parity")], directory, 30_000)).trim().split("\n");
      expect(lines).toHaveLength(CASES.length);
      CASES.forEach((c, i) => {
        const swift = JSON.parse(lines[i]!) as number[];
        const ts = solveTracks(c.t, c.width, c.gap, c.count, c.autoWidths);
        expect(swift).toHaveLength(ts.length);
        for (const [j, w] of swift.entries()) expect(Math.abs(w - ts[j]!)).toBeLessThanOrEqual(0.001);
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300000,
);
