/** Chrome's Web Animations vs the Swift runtime (`runtime/motion.swift`), sample by sample: timing, easing, a keyframed track. */
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { parseEasing } from "../../src/css/easing.ts";
import type { KeyframeMotion } from "../../src/model/semantic.ts";
import { easeExpr, timingExpr } from "../../src/swift/motion.ts";
import { SWIFT_RUNTIME } from "../../src/swift/runtime.ts";
import { command } from "../../tools/verify/process.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

const TIMINGS: Array<Pick<KeyframeMotion, "duration" | "delay" | "iterations" | "direction" | "fill">> = [
  { duration: 1000, delay: -300, iterations: "infinite", direction: "alternate", fill: "none" },
  { duration: 400, delay: 300, iterations: 2.5, direction: "reverse", fill: "both" },
  { duration: 400, delay: 0, iterations: 2, direction: "alternate-reverse", fill: "forwards" },
  { duration: 1000, delay: 100, iterations: 1, direction: "normal", fill: "none" },
];
const EASINGS = [
  "ease",
  "ease-in-out",
  "cubic-bezier(0.4, 0, 0.2, 1)",
  "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "steps(4, jump-both)",
  "linear(0, 0.25 75%, 1)",
];
/** Tailwind's `animate-pulse` timing function. */
const PULSE_EASE = "cubic-bezier(0.4, 0, 0.6, 1)";

interface Samples {
  timing: Array<Array<number | null>>;
  easing: number[][];
  pulse: number[];
}

async function chrome(): Promise<Samples> {
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>@keyframes pulse { 50% { opacity: .5 } } #p { animation: pulse 1s ${PULSE_EASE} infinite; }</style><div id="a"></div><div id="p"></div>`,
    );
    return await page.evaluate(
      ({ timings, easings }) => {
        const el = document.getElementById("a")!;
        const timing = timings.map((t) => {
          const a = el.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: t.duration,
            delay: t.delay,
            iterations: t.iterations === "infinite" ? Infinity : t.iterations,
            direction: t.direction,
            fill: t.fill,
          });
          a.pause();
          const out = Array.from({ length: 81 }, (_, k) => {
            a.currentTime = k * 25;
            return a.effect!.getComputedTiming().progress ?? null;
          });
          a.cancel();
          return out;
        });
        const easing = easings.map((e) => {
          const a = el.animate([{ opacity: 0, easing: e }, { opacity: 1 }], { duration: 1000, fill: "both" });
          a.pause();
          const out = Array.from({ length: 41 }, (_, k) => {
            a.currentTime = k * 25;
            return Number(getComputedStyle(el).opacity);
          });
          a.cancel();
          return out;
        });
        const p = document.getElementById("p")!;
        const pulse = p.getAnimations()[0]!;
        pulse.pause();
        const samples = Array.from({ length: 41 }, (_, k) => {
          pulse.currentTime = k * 25;
          return Number(getComputedStyle(p).opacity);
        });
        return { timing, easing, pulse: samples };
      },
      { timings: TIMINGS, easings: EASINGS },
    );
  } finally {
    await browser.close();
  }
}

async function swift(): Promise<Samples> {
  const dir = await mkdtemp(join(tmpdir(), "markswift-motion-timing-"));
  try {
    const timings = TIMINGS.map((t) => timingExpr({ name: "t", tracks: {}, ...t })).join(",\n    ");
    const eases = EASINGS.map((e) => easeExpr(parseEasing(e)!)).join(", ");
    const pulse = easeExpr(parseEasing(PULSE_EASE)!);
    await Bun.write(join(dir, "MarkswiftRuntime.swift"), SWIFT_RUNTIME);
    await Bun.write(
      join(dir, "main.swift"),
      `import SwiftUI
func row(_ values: [Double?]) -> String { "[" + values.map { $0.map { String($0) } ?? "null" }.joined(separator: ",") + "]" }
let timings = [
    ${timings}
]
let eases: [MarkswiftEase] = [${eases}]
let pulse = MarkswiftMotionTrack(1, [MarkswiftSegment(0.5, 0.5, ${pulse}), MarkswiftSegment(1, 1, ${pulse})])
let pulseTiming = MarkswiftTiming(duration: 1, iterations: .infinity)
let timing = timings.map { t in row((0...80).map { t.progress(at: Double($0 * 25) / 1000) }) }
let easing = eases.map { e in row((0...40).map { MarkswiftMotionTrack(0, [MarkswiftSegment(1, 1, e)]).value(at: Double($0) / 40) }) }
let pulsed = row((0...40).map { k in pulseTiming.progress(at: Double(k * 25) / 1000).map { pulse.value(at: $0) } })
print("{\\"timing\\":[" + timing.joined(separator: ",") + "],\\"easing\\":[" + easing.joined(separator: ",") + "],\\"pulse\\":" + pulsed + "}")
`,
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
        join(dir, "timing"),
        join(dir, "MarkswiftRuntime.swift"),
        join(dir, "main.swift"),
      ],
      dir,
      240_000,
    );
    return JSON.parse(await command([join(dir, "timing")], dir, 30_000)) as Samples;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const maxDelta = (a: Array<number | null>, b: Array<number | null>) =>
  Math.max(...a.map((v, i) => Math.abs((v ?? 0) - (b[i] ?? 0))));

nativeTest(
  "Swift timing, easing and keyframe tracks reproduce Chrome's Web Animations",
  async () => {
    const [web, native] = await Promise.all([chrome(), swift()]);
    for (const [i, row] of web.timing.entries()) {
      const mine = native.timing[i]!;
      expect(mine.map((v) => v === null)).toEqual(row.map((v) => v === null));
      expect(maxDelta(mine, row)).toBeLessThanOrEqual(1e-9);
    }
    for (const [i, row] of web.easing.entries()) {
      // Opacity clamps to 0…1 in both renderers (the overshooting bezier).
      const mine = native.easing[i]!.map((v) => Math.min(1, Math.max(0, v)));
      expect(maxDelta(mine, row)).toBeLessThanOrEqual(EASINGS[i]!.startsWith("steps") ? 1e-12 : 1e-5);
    }
    expect(maxDelta(native.pulse, web.pulse)).toBeLessThanOrEqual(1e-6);
  },
  300_000,
);
