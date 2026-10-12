import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import flexRowRuntime from "../../../src/swift/runtime/flex-row.swift" with { type: "text" };
import measuredRuntime from "../../../src/swift/runtime/measured-layout.swift" with { type: "text" };
import { command } from "../../../tools/verify/process.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

/** `Report` proposes its child 100 pt of width and prints the size it answers (layout may ask more than once). */
const MAIN = `import SwiftUI

struct Report: Layout {
    let label: String
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let size = subviews[0].sizeThatFits(ProposedViewSize(width: 100, height: nil))
        print("\\(label) \\(Double(size.width)) \\(Double(size.height))")
        return size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews[0].place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}

func frames(grows: Bool) -> some View {
    // A 20-high frame whose child is 50 high; a frame below it; a side frame beside both.
    MarkswiftMeasuredLayout(width: 100, height: 100, frames: [
        CGRect(x: 0, y: 0, width: 50, height: 20),
        CGRect(x: 0, y: 30, width: 50, height: 65),
        CGRect(x: 50, y: 0, width: 50, height: 90),
    ], grows: grows) {
        Color.red.frame(width: 50, height: 50)
        Color.blue.frame(width: 50, height: 65)
        Color.green.frame(width: 50, height: 90)
    }
}

let views: [AnyView] = [
    AnyView(Report(label: "fidelity") { frames(grows: false) }),
    AnyView(Report(label: "grows") { frames(grows: true) }),
    AnyView(Report(label: "fit") { Color.red.frame(idealWidth: 40, maxWidth: .infinity).frame(height: 10).markswiftFitWidth() }),
    AnyView(Report(label: "capped") { Color.red.frame(idealWidth: 400, maxWidth: .infinity).frame(height: 10).markswiftFitWidth() }),
]
for view in views { _ = ImageRenderer(content: view).nsImage }
`;

nativeTest(
  "app-mode measured layouts grow with their children and fit-width boxes take their content's width",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-measured-layout-"));
    try {
      await Bun.write(join(directory, "runtime.swift"), `import SwiftUI\n\n${measuredRuntime}\n\n${flexRowRuntime}`);
      await Bun.write(join(directory, "main.swift"), MAIN);
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
          "-default-isolation",
          "MainActor",
          "-o",
          join(directory, "measured"),
          join(directory, "runtime.swift"),
          join(directory, "main.swift"),
        ],
        directory,
        240_000,
      );
      const out: Record<string, number[]> = {};
      for (const line of (await command([join(directory, "measured")], directory, 30_000)).trim().split("\n")) {
        const [label, w, h] = line.split(" ");
        out[label!] ??= [Number(w), Number(h)];
      }
      // Captured frames as they are; growth of 30 moves the frame below down by 30, so the bottom (95 → 125) grows too.
      expect(out).toEqual({ fidelity: [100, 100], grows: [100, 130], fit: [40, 10], capped: [100, 10] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300000,
);
