import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SWIFT_RUNTIME } from "../../../src/swift/runtime.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  "motion runtime typechecks warning-free (iOS 18, Swift 6 strict concurrency, MainActor default)",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-motion-typecheck-"));
    try {
      await Bun.write(join(directory, "MarkswiftRuntime.swift"), SWIFT_RUNTIME);
      await Bun.write(
        join(directory, "Probe.swift"),
        `import SwiftUI

struct Probe: View {
    var body: some View {
        VStack {
            Color.red.frame(width: 32, height: 32)
                .modifier(MarkswiftAnimation(motions: [MarkswiftMotion(MarkswiftTiming(duration: 1, iterations: .infinity), degrees: MarkswiftMotionTrack(0, [MarkswiftSegment(360, 1, .points([0, 1], [0, 1]))]))], reduced: []))
            Text("Fade")
                .modifier(MarkswiftAnimation(motions: [MarkswiftMotion(MarkswiftTiming(duration: 0.3, delay: 0.1, fillBackwards: true, fillForwards: true), opacity: MarkswiftMotionTrack(0, [MarkswiftSegment(1, 1, .bezier(0, 0, 0.58, 1))]), y: MarkswiftMotionTrack(8, [MarkswiftSegment(0, 1, .bezier(0, 0, 0.58, 1))]))], base: MarkswiftMotionValue(opacity: 0.5), anchor: UnitPoint(x: 0, y: 0)))
            Color.blue.frame(width: 24, height: 24)
                .modifier(MarkswiftAnimation(motions: [MarkswiftMotion(MarkswiftTiming(duration: 0.8, iterations: 2.5, direction: .alternateReverse), scaleX: MarkswiftMotionTrack(1, [MarkswiftSegment(1.15, 0.5, .steps(4, .both)), MarkswiftSegment(1, 1, .steps(1, .start))]))]))
            Color.green.frame(width: 24, height: 24)
                .modifier(MarkswiftStateAnimation(isOn: true, into: .timingCurve(0.4, 0, 0.2, 1, duration: 0.15).delay(0.1), back: Animation(MarkswiftEasing(duration: 0.3, ease: .steps(4, .end))), reducedInto: Animation(MarkswiftEasing(duration: 0.3, ease: .points([0, 1], [0, 1]))), reducedBack: nil))
        }
        .environment(\\.markswiftMotionTime, 0.25)
        .environment(\\.markswiftForcedStates, .reduceMotion)
    }
}
`,
      );
      const check = await typecheck(directory);
      if (!check.ok) throw new Error(check.output);
      expect(check.output).not.toContain("warning:");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);
