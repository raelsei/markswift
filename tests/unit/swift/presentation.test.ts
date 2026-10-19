import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";
import presentationRuntime from "../../../src/swift/runtime/presentation.swift" with { type: "text" };
import { command } from "../../../tools/verify/process.ts";
import { typecheck } from "../../../tools/verify/typecheck.ts";
import { DIALOG, NATIVE, POPOVER, SHEET } from "../../helpers/presentations.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const compile = (d: LayoutDoc, mode: "app" | "fidelity" = "app") => compileLayout(d, { name: "Overlay", mode });

test("dialog: init-seeded presented state, trigger sets it then acts, closers act then close, one presentation", () => {
  const { code, openStates } = compile(DIALOG());
  expect(code).toContain("@State private var isEditProfilePresented: Bool");
  expect(code.split("\n").find((l) => l.startsWith("    init("))).toContain("isEditProfilePresented: Bool = false");
  expect(code).toMatch(/Button \{\n +isEditProfilePresented = true\n +onOpen\(\)\n +\} label: \{/);
  expect(code).toMatch(/Button \{\n +onCancel\(\)\n +isEditProfilePresented = false\n +\} label: \{/);
  expect(code).toMatch(/Button \{\n +onClose\(\)\n +isEditProfilePresented = false\n +\} label: \{/);
  expect(code).toContain("Button(action: onSaveChanges) {");
  expect(code).toContain(
    "/// Escape or a tap outside closed edit-profile\n    var onEditProfileDismissed: () -> Void = {}",
  );
  expect(code.split(".markswiftPresentation(").length).toBe(2);
  expect(code).toContain(
    ".markswiftPresentation(isPresented: $isEditProfilePresented, modal: true, dismissOnEscape: true, dismissOnOutside: true, onDismiss: onEditProfileDismissed) {",
  );
  const block = code.slice(code.indexOf(".markswiftPresentation("));
  expect(block).toMatch(/\.allowsHitTesting\(false\)\n +v_card\n +\.markswiftPlaced\(\.center\)/);
  expect(code).toContain('.accessibilityValue(isEditProfilePresented ? "expanded" : "collapsed")');
  expect(code).toContain('#Preview("Overlay — edit-profile open") {\n    Overlay(isEditProfilePresented: true)');
  expect(openStates).toEqual({ "edit-profile": "isEditProfilePresented" });
});

test("placements: sheet edge, anchored popover with the trigger's anchor, hover card long-press, native backdrop", () => {
  expect(compile(SHEET()).code).toContain(".markswiftPlaced(.edge(.trailing))");
  const popover = compile(POPOVER()).code;
  expect(popover).toContain('.markswiftAnchor("open-popover")');
  expect(popover).toContain(
    '.markswiftPlaced(.anchored("open-popover", from: UnitPoint(x: 0.0, y: 1.0), to: UnitPoint(x: 0.0, y: 0.0), gap: CGSize(width: 0.0, height: 4.0)))',
  );
  const hover = compile(POPOVER("hover")).code;
  expect(hover).toContain(".simultaneousGesture(LongPressGesture().onEnded { _ in isNextjsPresented = true })");
  expect(hover).not.toContain("isNextjsPresented = true\n");
  const native = compile(NATIVE()).code;
  expect(native).toMatch(/\{\n +Color\.markswift\(0\.0, 0\.0, 0\.0, 0\.1\)\n +\.allowsHitTesting\(false\)\n/);
});

test("a self-aligned trigger anchors its own box: .markswiftAnchor before the alignment frame", () => {
  const d = POPOVER("hover");
  d.root.styles = { ...d.root.styles, display: "flex", "flex-direction": "column", "align-items": "stretch" };
  d.root.children[0]!.styles = { ...d.root.children[0]!.styles, "align-self": "flex-start" };
  expect(compile(d).code).toMatch(
    /\n +\.markswiftAnchor\("nextjs"\)\n +\.simultaneousGesture\(LongPressGesture\(\)[^\n]*\n +\.frame\(maxWidth: \.infinity, alignment: \.leading\)\n/,
  );
});

test("fidelity ignores presentations byte for byte; a scrolling app root keeps its presentation on the ScrollView", () => {
  for (const d of [DIALOG(), POPOVER(), NATIVE()]) {
    const without = structuredClone(d);
    delete without.layers;
    expect(compile(d, "fidelity").code).toBe(compile(without, "fidelity").code);
    expect(compile(d, "fidelity").openStates).toBeUndefined();
  }
  const tall = DIALOG();
  tall.size.h = 1600;
  tall.root.bounds.h = 1600;
  const code = compile(tall).code;
  expect(code).toMatch(/\n( +)ScrollView\(\.vertical\) \{\n[\s\S]*?\n\1\}\n(\1\.[^\n]*\n)*\1\.markswiftPresentation\(/);
});

nativeTest(
  "generated presentations typecheck",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-presentation-views-"));
    try {
      for (const [i, d] of [DIALOG(), SHEET(), POPOVER(), POPOVER("hover"), NATIVE()].entries()) {
        const out = join(directory, String(i));
        for (const [file, content] of Object.entries(compile(d).files)) await Bun.write(join(out, file), content);
        const check = await typecheck(out);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);

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

function fluidDialog(): LayoutDoc {
  const d = NATIVE();
  const content = d.layers![0]!.nodes[0]!;
  content.preferredSize!.width = "calc(100% - 90px)";
  content.styles["box-sizing"] = "border-box";
  content.styles["max-width"] = "500px";
  return d;
}

test("dialog width preserves authored percentage/calc and intrinsic height", () => {
  const code = compile(fluidDialog()).code;
  expect(code).toContain("MarkswiftPresentationWidth(fraction: 1.0, offset: -90.0, minimum: 0.0, maximum: 500.0)");
  expect(code).not.toContain(".frame(width: 300.0, height: 100.0)");
  const fixed = NATIVE();
  expect(compile(fixed).code).not.toContain("MarkswiftPresentationWidth(");
  const unknown = fluidDialog();
  unknown.layers![0]!.nodes[0]!.styles["max-width"] = "80%";
  expect(compile(unknown).code).not.toContain("MarkswiftPresentationWidth(");
});

function repeatedTriggers(): LayoutDoc {
  const d = DIALOG();
  d.root.styles["padding-top"] = "8px";
  const first = d.root.children[0]!;
  const second = structuredClone(first);
  second.id = "second-trigger";
  second.attrs.id = "second-trigger";
  second.bounds.y += 48;
  d.root.children.push(second);
  const layer = structuredClone(d.layers![0]!);
  layer.id = "second-dialog";
  layer.trigger = second.id;
  const rename = (n: typeof first): void => {
    if (n.id) n.id += "-second";
    n.children.forEach(rename);
  };
  layer.nodes.forEach(rename);
  layer.dismiss.buttons = layer.dismiss.buttons.map((id) => id + "-second");
  d.layers!.push(layer);
  return d;
}

test("repeated triggers share a ForEach while each presentation keeps its screen-owned state", () => {
  const code = compile(repeatedTriggers()).code;
  expect(code).toContain("ForEach(");
  expect(code).toContain("@Binding var");
  expect(code).toContain("$isEditProfilePresented");
  expect(code).toContain("$isSecondDialogPresented");
  expect(code).toContain("?? .constant(false)");
  expect(code.match(/\.markswiftPresentation\(/g)).toHaveLength(2);
});

nativeTest(
  "fluid dialogs and repeated triggers compile for iOS",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "markswift-responsive-dialog-"));
    try {
      for (const [i, d] of [fluidDialog(), repeatedTriggers()].entries()) {
        const out = join(dir, String(i));
        for (const [file, content] of Object.entries(compile(d).files)) await Bun.write(join(out, file), content);
        const check = await typecheck(out);
        if (!check.ok) throw new Error(check.output);
        expect(check.ok).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  120_000,
);

nativeTest(
  "fluid presentation measures wrapping height at the current width and honours its cap",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "markswift-dialog-width-"));
    try {
      await Bun.write(
        join(dir, "main.swift"),
        `import SwiftUI
${presentationRuntime}
struct Report: Layout {
    let offered: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let s = subviews[0].sizeThatFits(ProposedViewSize(width: offered, height: nil))
        print("\\(Int(offered)) \\(s.width) \\(s.height)")
        return s
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews[0].place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
    }
}
for width in [320, 390, 768] as [CGFloat] {
    let view = Report(offered: width) {
        MarkswiftPresentationWidth(fraction: 1, offset: -90, minimum: 0, maximum: 500) {
            Text(String(repeating: "Responsive dialog content ", count: 8)).font(.system(size: 16)).fixedSize(horizontal: false, vertical: true)
        }
    }
    _ = ImageRenderer(content: view).nsImage
}
`,
      );
      const sdk = (await command(["xcrun", "--sdk", "macosx", "--show-sdk-path"])).trim();
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
          join(dir, "probe"),
          join(dir, "main.swift"),
        ],
        dir,
        120_000,
      );
      const sizes = new Map(
        (await command([join(dir, "probe")]))
          .trim()
          .split("\n")
          .map((line) => {
            const [w, actual, height] = line.split(" ").map(Number);
            return [w!, [actual!, height!]];
          }),
      );
      expect([...sizes.values()].map(([width]) => width)).toEqual([230, 300, 500]);
      expect(sizes.get(320)![1]).toBeGreaterThan(sizes.get(768)![1]!);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  120_000,
);
