import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";

function capturedText(styles: Record<string, string>): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "constraints.html",
    combo: { screen: "constraints", theme: "light" },
    size: { w: 200, h: 100 },
    dpr: 1,
    canvas: "white",
    fonts: [],
    root: {
      id: "root",
      tag: "main",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 200, h: 100 },
      children: [
        {
          id: "text",
          tag: "p",
          attrs: {},
          styles: {
            display: "block",
            "box-sizing": "border-box",
            "font-family": "system-ui",
            "font-size": "14px",
            "line-height": "20px",
            ...styles,
          },
          bounds: { x: 0, y: 0, w: 200, h: 30 },
          children: [
            { tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 40, h: 16 }, text: "Hi", children: [] },
          ],
        },
      ],
    },
  };
}

test("native text retains a CSS minimum height even when inference identifies intrinsic content", () => {
  const screen = inferScreen(capturedText({ "min-height": "30px" }), "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    expect(emitSwift(screen, "ConstraintView", { mode }).view).toContain("minHeight: 30.0");
  }
});

test("a captured maximum height remains a frame constraint before clipping", () => {
  const input = capturedText({ "max-height": "10px", "overflow-y": "hidden" });
  input.root.children[0]!.bounds.h = 10;
  const screen = inferScreen(input, "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    expect(code).toContain("maxHeight: 10.0");
    expect(code.indexOf("maxHeight: 10.0")).toBeLessThan(code.indexOf(".clipShape("));
  }
});

test("a finite width cap stays on the painted box rather than being expanded by a later fill frame", () => {
  const screen = inferScreen(capturedText({}), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  const node = screen.root.children[0]!;
  node.width = { kind: "fill" };
  node.maxWidth = 120;
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    const section = code.slice(code.indexOf('Text(verbatim: "Hi")')).split("\n        }")[0]!;
    expect(section).toContain("maxWidth: 120.0");
    expect(section).not.toContain("maxWidth: .infinity");
  }
});

test("an overflow-hidden row takes its parent's width and clips overflowing items instead of growing to them", () => {
  // flex-wrap--wrap #wrap-none: chips cannot shrink below their single word, so Chrome lets them
  // overflow the 200px card and clips them. A bare `maxWidth: .infinity` frame grows to the
  // HStack's ideal width instead, widening every ancestor (and the whole page) before the clip.
  const chip = (id: string, x: number, text: string) => ({
    id,
    tag: "span",
    attrs: {},
    styles: { display: "block", "font-family": "system-ui", "font-size": "13px", "line-height": "16px" },
    bounds: { x, y: 0, w: 150, h: 16 },
    children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x, y: 0, w: 150, h: 16 }, text, children: [] }],
  });
  const input = capturedText({});
  input.root.children = [
    {
      id: "row",
      tag: "div",
      attrs: {},
      styles: {
        display: "flex",
        "flex-wrap": "nowrap",
        "column-gap": "8px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
      },
      bounds: { x: 0, y: 0, w: 200, h: 16 },
      children: [chip("a", 0, "Engineering"), chip("b", 158, "Marketing")],
    },
  ];
  const screen = inferScreen(input, "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    const row = code.slice(code.indexOf("private var v_row"));
    expect(row).toContain(
      ".frame(minWidth: 0.0, maxWidth: .infinity, alignment: .topLeading)\n        .clipShape(Rectangle())",
    );
  }
});

function overflowingRow(item: Record<string, string>): LayoutDoc {
  // img.html at 320px: three 112px items plus gaps (360) overflow the 288px block row. CSS keeps
  // the row at its container's width; a bare `maxWidth: .infinity` frame grows to the HStack's
  // ideal width instead, widening every ancestor (the root VStack, and so a `width: 100%` image).
  const input = capturedText({});
  input.root.children = [
    {
      id: "row",
      tag: "div",
      attrs: {},
      styles: { display: "flex", "column-gap": "12px" },
      bounds: { x: 0, y: 0, w: 200, h: 40 },
      children: [0, 1, 2].map((i) => ({
        id: `item${i}`,
        tag: "div",
        attrs: {},
        styles: { display: "block", "background-color": "rgb(220, 80, 60)", ...item },
        bounds: { x: i * 92, y: 0, w: 80, h: 40 },
        children: [],
      })),
    },
  ];
  return input;
}

test("a fill-width block keeps its parent's width when its content overflows, without clipping", () => {
  const screen = inferScreen(overflowingRow({ width: "80px", height: "40px" }), "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    const row = code.slice(code.indexOf("private var v_row"));
    expect(row).toContain(".frame(minWidth: 0.0, maxWidth: .infinity");
  }
});

test("flex-grow items of a row keep growing to their content, as CSS's automatic minimum does", () => {
  const input = overflowingRow({ "flex-grow": "1", height: "40px" });
  for (const item of input.root.children[0]!.children) item.bounds.w = 58.67;
  const screen = inferScreen(input, "constraints");
  if (screen.root.kind !== "stack" || screen.root.children[0]?.kind !== "stack") throw new Error("expected stacks");
  expect(screen.root.children[0].children.map((c) => c.width.kind)).toEqual(["fill", "fill", "fill"]);
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    const row = code.slice(code.indexOf("private var v_row"));
    const items = row.slice(row.indexOf("HStack"), row.indexOf("\n        }"));
    expect(items).toContain("maxWidth: .infinity");
    expect(items).not.toContain("minWidth: 0.0");
  }
});

test("finite caps preserve intrinsic dimensions before background paint", () => {
  const screen = inferScreen(capturedText({ "background-color": "rgb(220, 80, 60)" }), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  const node = screen.root.children[0]!;
  node.width = { kind: "hug" };
  node.height = { kind: "hug" };
  node.maxWidth = 200;
  node.maxHeight = 100;
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    const capped = code.slice(code.indexOf("maxWidth: 200.0, maxHeight: 100.0"));
    expect(capped).toContain(".fixedSize(horizontal: true, vertical: true)");
    expect(capped.indexOf(".fixedSize(")).toBeLessThan(capped.indexOf(".background("));
  }
});

test("minimum height leaves block text at the top of its line box", () => {
  const screen = inferScreen(capturedText({ "min-height": "30px" }), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  expect(screen.root.children[0]!.padding).toEqual([0, 0, 10, 0]);
});

test("a height cap clipping the first line keeps its top rather than its center", () => {
  const input = capturedText({ "max-height": "10px", "overflow-y": "hidden" });
  input.root.children[0]!.bounds.h = 10;
  const screen = inferScreen(input, "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    expect(code).toContain("maxHeight: 10.0, alignment: .topLeading");
    if (mode === "fidelity") expect(code).toContain("height: 10.0, alignment: .topLeading");
  }
});

test("a measured fallback grows with its text in app mode but is never stretched", () => {
  const screen = inferScreen(capturedText({}), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  screen.root.height = { kind: "fixed", px: 100 };
  screen.root.padding = [0, 0, 0, 0];
  screen.root.measured = { width: 200, height: 100, frames: [{ x: 0, y: 0, w: 200, h: 30 }] };
  const app = emitSwift(screen, "ConstraintView", { mode: "app" }).view;
  // MarkswiftMeasuredLayout sizes itself (captured height plus its children's growth), so a floor takes no extra space.
  expect(app).toContain("], grows: true) {");
  expect(app).toContain("minHeight: 100.0");
  expect(app).not.toContain("maxHeight: .infinity");
  const fidelity = emitSwift(screen, "ConstraintView", { mode: "fidelity" }).view;
  expect(fidelity).toContain(".frame(height: 100.0, alignment: .topLeading)");
  expect(fidelity).not.toContain("grows:");
});

test("a box pinned only against its filling children fits its content in app mode", () => {
  const screen = inferScreen(capturedText({}), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  screen.root.children[0]!.width = { kind: "fixed", px: 123, hug: true };
  const app = emitSwift(screen, "ConstraintView", { mode: "app" }).view;
  expect(app).toContain(".markswiftFitWidth()");
  expect(app).not.toContain("width: 123.0");
  const fidelity = emitSwift(screen, "ConstraintView", { mode: "fidelity" }).view;
  expect(fidelity).toContain("width: 123.0");
  expect(fidelity).not.toContain("markswiftFitWidth");
});

test("app-mode text controls treat a measured height as a floor", () => {
  const input: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "controls.html",
    combo: { screen: "controls", theme: "light" },
    size: { w: 200, h: 38 },
    dpr: 1,
    canvas: "white",
    fonts: [],
    root: {
      id: "root",
      tag: "main",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 200, h: 38 },
      children: [
        {
          id: "field",
          tag: "input",
          attrs: { type: "text", value: "a" },
          styles: { display: "inline-block", "font-family": "system-ui", "font-size": "14px" },
          bounds: { x: 0, y: 0, w: 200, h: 38 },
          children: [],
        },
      ],
    },
  };
  // The `#Preview` frame is the captured screen size (`height: 38.0` here too); check the view body only.
  const [app, fidelity] = (["app", "fidelity"] as const).map(
    (mode) => compileLayout(input, { name: "F", mode }).code.split("#Preview")[0]!,
  );
  expect(app).toContain("minHeight: 38.0");
  expect(app).not.toContain("height: 38.0");
  expect(fidelity).toContain("height: 38.0");
});
