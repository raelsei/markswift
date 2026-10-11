import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout } from "../../../src/compiler/index.ts";
import flowRuntime from "../../../src/swift/runtime/flow.swift" with { type: "text" };
import { typecheck } from "../../../tools/verify/typecheck.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";

function fixture(wrap = "wrap"): LayoutDoc {
  const children: LayoutNode[] = [
    [0, 0],
    [90, 0],
    [0, 50],
  ].map(([x, y], index) => ({
    tag: "div",
    id: `item-${index}`,
    attrs: {},
    children: [],
    bounds: { x: x!, y: y!, w: 80, h: 40 },
    preferredSize: { width: "80px", height: "40px" },
    styles: {
      display: "block",
      "box-sizing": "border-box",
      "flex-grow": "0",
      "flex-shrink": "0",
      "background-color": "rgb(255,0,0)",
    },
  }));
  const root: LayoutNode = {
    tag: "main",
    id: "root",
    attrs: {},
    children,
    bounds: { x: 0, y: 0, w: 200, h: 90 },
    preferredSize: { width: "200px", height: "auto" },
    styles: {
      display: "flex",
      "flex-wrap": wrap,
      "column-gap": "10px",
      "row-gap": "10px",
      "align-items": "flex-start",
    },
  };
  return {
    version: LAYOUT_DOC_VERSION,
    source: "wrap-test",
    combo: { screen: "s", theme: "light" },
    size: { w: 200, h: 90 },
    dpr: 1,
    canvas: "rgb(255,255,255)",
    fonts: [],
    root,
  };
}

test("supported wrapping compiles to the native flow runtime in both modes", () => {
  for (const mode of ["app", "fidelity"] as const) {
    const output = compileLayout(fixture(), { name: "WrappedView", mode });
    expect(output.code).toContain("MarkswiftFlow(");
    expect(output.code).not.toContain("MarkswiftMeasuredLayout(");
    expect(output.files["MarkswiftRuntime.swift"]).toContain("struct MarkswiftFlow: Layout");
    expect(
      output.diagnostics
        .flatMap((item) => item.diagnostics)
        .map((d) => d.message)
        .join(" "),
    ).not.toContain("fixed rows from the snapshot");
  }
});

test("unsupported wrapping emits captured positions and an explicit reflow limitation", () => {
  const output = compileLayout(fixture("wrap-reverse"), { name: "WrappedView" });
  expect(output.code).toContain("MarkswiftMeasuredLayout(");
  expect(output.code).not.toContain("MarkswiftFlow(");
  expect(
    output.diagnostics
      .flatMap((item) => item.diagnostics)
      .map((d) => d.message)
      .join(" "),
  ).toContain("cannot reflow");
});

test("a fixed-height start-packed host centers children within each row without centering the flow block", () => {
  const doc = fixture();
  doc.root.bounds.h = 200;
  doc.size.h = 300;
  doc.root.preferredSize!.height = "200px";
  Object.assign(doc.root.styles, { "align-content": "start", "align-items": "center", "justify-content": "center" });
  const [short, tall, last] = doc.root.children;
  Object.assign(short!.bounds, { x: 15, y: 10, h: 20 });
  short!.preferredSize!.height = "20px";
  Object.assign(tall!.bounds, { x: 105, y: 0 });
  Object.assign(last!.bounds, { x: 60, y: 50, h: 20 });
  last!.preferredSize!.height = "20px";
  doc.root = {
    tag: "main",
    id: "page",
    attrs: {},
    styles: { display: "block" },
    bounds: { x: 0, y: 0, w: 200, h: 300 },
    children: [doc.root],
  };
  for (const mode of ["app", "fidelity"] as const) {
    const output = compileLayout(doc, { name: "CenteredRows", mode });
    expect(output.code).toContain(
      "MarkswiftFlow(columnGap: 10.0, rowGap: 10.0, horizontal: .center, vertical: .center)",
    );
    expect(output.code).toContain("height: 200.0, alignment: .topLeading)");
    expect(output.code).toContain(".frame(width: 80.0, height: 20.0");
    expect(output.code).not.toContain(".padding(.top, 10)");
    expect(output.code).not.toContain("MarkswiftMeasuredLayout(");
  }
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest(
  "flow runtime implements SwiftUI Layout and accepts fixed children with row alignment",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-flow-typecheck-"));
    try {
      await Bun.write(
        join(directory, "FlowFixture.swift"),
        `import SwiftUI\n\n${flowRuntime}\n
struct FlowFixture: View {
    var body: some View {
        MarkswiftFlow(columnGap: 10, rowGap: 12, horizontal: .trailing, vertical: .center) {
            Color.red.frame(width: 80, height: 40)
            Color.blue.frame(width: 120, height: 60)
            Color.green.frame(width: 80, height: 40)
        }
        .frame(width: 200)
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
