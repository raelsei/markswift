import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import presentationRuntime from "../../../src/swift/runtime/presentation.swift" with { type: "text" };
import { typecheck } from "../../../tools/verify/typecheck.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  "presentation runtime: four placements, an anchor, init-seeded state and a modal presented preview typecheck",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-presentation-typecheck-"));
    try {
      await Bun.write(
        join(directory, "PresentationFixture.swift"),
        `import SwiftUI\n\n${presentationRuntime}\n
struct PresentationFixture: View {
    @State private var isPresented: Bool
    var onDismissed: () -> Void = {}
    init(isPresented: Bool = false) {
        _isPresented = State(initialValue: isPresented)
    }
    var body: some View {
        VStack {
            Button("Open") { isPresented = true }
                .markswiftAnchor("open")
        }
        .frame(width: 390, height: 844)
        .markswiftPresentation(isPresented: $isPresented, modal: true, dismissOnEscape: true, dismissOnOutside: true, onDismiss: onDismissed) {
            Color.black.opacity(0.5)
                .allowsHitTesting(false)
            Color.white.frame(width: 300, height: 200)
                .markswiftPlaced(.center)
            Color.white.frame(width: 290, height: 844)
                .markswiftPlaced(.edge(.trailing))
            Color.white.frame(width: 100, height: 40)
                .markswiftPlaced(.offset(CGSize(width: 16, height: 120)))
            Color.white.frame(width: 288, height: 120)
                .markswiftPlaced(.anchored("open", from: UnitPoint(x: 0, y: 1), to: UnitPoint(x: 0, y: 0), gap: CGSize(width: 0, height: 4)))
        }
    }
}

#Preview("open") {
    PresentationFixture(isPresented: true)
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
  120_000,
);
