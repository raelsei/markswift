import { expect, test } from "bun:test";
import { sizeOf } from "../../../src/analysis/sizing.ts";
import { parseDeclared } from "../../../src/css/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { InferenceContext } from "../../../src/analysis/context.ts";
import type { Diagnostic } from "../../../src/model/semantic.ts";

function element(
  w: number,
  h: number,
  styles: Record<string, string> = {},
  children: LayoutNode[] = [],
  inline = "",
): LayoutNode {
  return { tag: "div", attrs: { style: inline }, bounds: { x: 0, y: 0, w, h }, styles, children };
}
const parent = element(400, 200, {
  display: "block",
  "padding-left": "20px",
  "padding-right": "20px",
  "border-left-style": "solid",
  "border-right-style": "solid",
  "border-left-width": "5px",
  "border-right-width": "5px",
});
const ctx: InferenceContext = {
  root: parent,
  parent,
  parentAxis: "v",
  parentDisplay: "block",
  parentAlign: "stretch",
  bundledFamilies: {},
  fixed: [],
};
function sizing(n: LayoutNode, context = ctx) {
  const diagnostics: Diagnostic[] = [];
  return { ...sizeOf(n, parseDeclared(n.attrs.style), context, diagnostics), diagnostics };
}
const ownInsets = {
  "padding-left": "10px",
  "padding-right": "10px",
  "border-left-style": "solid",
  "border-right-style": "solid",
  "border-left-width": "4px",
  "border-right-width": "4px",
};

test.each([
  ["50%", "border-box", 175],
  ["50%", "content-box", 203],
  ["calc(50% - 10px)", "border-box", 165],
  ["calc(50% - 10px)", "content-box", 193],
  ["120px", "border-box", 120],
  ["120px", "content-box", 148],
] as const)("max-width %s with %s is normalized to border-box pixels", (value, boxSizing, expected) => {
  expect(sizing(element(expected, 40, { ...ownInsets, "box-sizing": boxSizing, "max-width": value })).maxWidth).toBe(
    expected,
  );
});

test("intrinsic or unresolved max-width never turns into a zero-pixel cap", () => {
  const result = sizing(element(120, 40, { "max-width": "fit-content" }));
  expect(result.maxWidth).toBe(120);
  expect(result.diagnostics.map((d) => d.message).join("\n")).toContain("max-width");
});

test("a percentage cap without a captured containing block preserves the observed width", () => {
  const n = element(175, 40, { "max-width": "50%" });
  const result = sizing(n, { root: n, bundledFamilies: {}, fixed: [] });
  expect(result.maxWidth).toBe(175);
  expect(result.diagnostics.map((d) => d.message).join("\n")).toContain("captured");
});

test("min-width wins over a conflicting max-width", () => {
  const result = sizing(element(180, 40, { "min-width": "180px", "max-width": "100px", "box-sizing": "border-box" }));
  expect(result).toMatchObject({ minWidth: 180, maxWidth: 180 });
});

test("a small border-box limit cannot make the content box negative", () => {
  expect(sizing(element(28, 40, { ...ownInsets, "max-width": "5px", "box-sizing": "border-box" })).maxWidth).toBe(28);
});

test("height floors and caps survive text line-box slack", () => {
  const text = { ...element(40, 16), tag: "#text", text: "Hi" };
  const common = { "line-height": "20px", "box-sizing": "border-box" };
  expect(sizing(element(40, 30, { ...common, "min-height": "30px" }, [text])).minHeight).toBe(30);
  expect(sizing(element(40, 10, { ...common, "max-height": "10px" }, [text])).maxHeight).toBe(10);
});

test("vertical content-box constraints include vertical padding and borders", () => {
  const n = element(80, 70, {
    "min-height": "40px",
    "max-height": "60px",
    "padding-top": "10px",
    "padding-bottom": "10px",
    "border-top-style": "solid",
    "border-bottom-style": "solid",
    "border-top-width": "5px",
    "border-bottom-width": "5px",
  });
  expect(sizing(n)).toMatchObject({ minHeight: 70, maxHeight: 90 });
});

test("percentage heights keep the captured constraint instead of guessing parent definiteness", () => {
  const result = sizing(element(40, 60, { "min-height": "50%", "max-height": "calc(75% - 10px)" }));
  expect(result).toMatchObject({ minHeight: 60, maxHeight: 60 });
  expect(result.diagnostics.map((d) => d.message).join("\n")).toContain("captured");
});

test("100% content-box dimensions with padding retain measured overflow", () => {
  const containing = element(200, 100);
  const context = { ...ctx, root: containing, parent: containing };
  const n = element(
    224,
    124,
    {
      "padding-left": "10px",
      "padding-right": "10px",
      "padding-top": "10px",
      "padding-bottom": "10px",
      "border-left-style": "solid",
      "border-right-style": "solid",
      "border-top-style": "solid",
      "border-bottom-style": "solid",
      "border-left-width": "2px",
      "border-right-width": "2px",
      "border-top-width": "2px",
      "border-bottom-width": "2px",
      "box-sizing": "content-box",
    },
    [],
    "width:100%;height:100%",
  );
  expect(sizing(n, context)).toMatchObject({ width: { kind: "fixed", px: 224 }, height: { kind: "fixed", px: 124 } });
});

test("100% border-box dimensions still fill the captured containing box", () => {
  const containing = element(200, 100);
  const n = element(200, 100, { "box-sizing": "border-box" }, [], "width:100%;height:100%");
  expect(sizing(n, { ...ctx, root: containing, parent: containing })).toMatchObject({
    width: { kind: "fill" },
    height: { kind: "fill" },
  });
});

test("stylesheet fixed sizes are retained even when they happen to match content extent", () => {
  const n = { ...element(120, 40, {}, [element(120, 40)]), preferredSize: { width: "120px", height: "40px" } };
  expect(sizing(n)).toMatchObject({ width: { kind: "fixed", px: 120 }, height: { kind: "fixed", px: 40 } });
});

test("captured CSS size intent wins over an inline value overridden by the cascade", () => {
  const containing = element(200, 100);
  const n = {
    ...element(200, 30, {}, [element(200, 30)], "width:120px;height:100px"),
    preferredSize: { width: "auto", height: "auto" },
  };
  expect(sizing(n, { ...ctx, parent: containing })).toMatchObject({ width: { kind: "fill" }, height: { kind: "hug" } });
});

test("ordinary inline text does not acquire CSS constraints that the browser ignores", () => {
  expect(
    sizing(element(30, 20, { display: "inline", "min-width": "120px", "min-height": "80px", "max-width": "200px" })),
  ).toMatchObject({ width: { kind: "fixed", px: 30 } });
  expect(sizing(element(30, 20, { display: "inline", "min-width": "120px" })).minWidth).toBeUndefined();
});

const row: InferenceContext = { ...ctx, parentAxis: "h", parentDisplay: "flex" };
const widthNotes = (n: LayoutNode, context = ctx) =>
  sizing(n, context)
    .diagnostics.filter((d) => d.feature === "width")
    .map((d) => d.message);

test("a percentage width kept as measured px is reported", () => {
  const n = { ...element(180, 40, { display: "block" }), preferredSize: { width: "50%", height: "auto" } };
  expect(widthNotes(n, row).join("\n")).toContain("width 50% pinned at 180px");
});

test("a px width laid out at another size is reported", () => {
  const n = {
    ...element(108, 40, { display: "block", "box-sizing": "border-box" }),
    preferredSize: { width: "150px", height: "auto" },
  };
  expect(widthNotes(n, row).join("\n")).toContain("width 150px laid out at 108px");
});

test("a content-box px width plus its padding is not a pin", () => {
  const styles = { display: "block", "box-sizing": "content-box", "padding-left": "10px", "padding-right": "10px" };
  const n = { ...element(140, 40, styles), preferredSize: { width: "120px", height: "auto" } };
  expect(widthNotes(n, row)).toEqual([]);
});

test("a px width laid out at its own size is not reported", () => {
  const n = {
    ...element(120, 40, { display: "block", "box-sizing": "border-box" }),
    preferredSize: { width: "120px", height: "auto" },
  };
  expect(widthNotes(n, row)).toEqual([]);
});

test("the root's width is not reported: the screen sizes it", () => {
  const n = { ...element(390, 40, { display: "block" }), preferredSize: { width: "100%", height: "auto" } };
  expect(widthNotes(n, { root: n, bundledFamilies: {}, fixed: [] })).toEqual([]);
});

test.each([
  [["right", "left"], "center"],
  [["left"], "end"],
  [["right"], undefined],
  [undefined, undefined],
] as const)("a fixed-width block with auto margins %p is placed %p", (autoMargins, expected) => {
  // Parent content box is 350 px wide; 95 px used margins on each side make the margin box fill it.
  const box: LayoutNode = {
    ...element(160, 40, { display: "block", "margin-left": "95px", "margin-right": "95px" }),
    preferredSize: { width: "160px", height: "auto", ...(autoMargins ? { autoMargins: [...autoMargins] } : {}) },
  };
  const s = sizing(box);
  expect(s.width).toEqual({ kind: "fixed", px: 160 });
  expect(s.selfAlign).toBe(expected);
});

const block300 = element(300, 200, { display: "block" });
const half = (w: number, styles: Record<string, string> = {}, width = "50%"): LayoutNode => ({
  ...element(w, 40, { display: "block", ...styles }),
  preferredSize: { width, height: "auto" },
});

test("a percentage width that is exactly its fraction of the containing block keeps the fraction", () => {
  const s = sizing(half(150), { ...ctx, parent: block300 });
  expect(s.width).toEqual({ kind: "fraction", fraction: 0.5, px: 150 });
  expect(s.diagnostics.filter((d) => d.feature === "width")).toEqual([]);
});

test.each<[string, LayoutNode, InferenceContext]>([
  ["a calc() percentage", half(142, {}, "calc(50% - 8px)"), { ...ctx, parent: block300 }],
  ["a side margin", half(150, { "margin-left": "8px" }), { ...ctx, parent: block300 }],
  ["a box-sizing mismatch (140px measured)", half(140), { ...ctx, parent: block300 }],
  ["absolute position", half(150, { position: "absolute" }), { ...ctx, parent: block300 }],
  ["a flex-row parent", half(150), { ...row, parent: block300 }],
  ["a centring column", half(150), { ...ctx, parent: block300, parentAlign: "center" }],
])("no fraction: %s", (_label, n, context) => {
  expect(sizing(n, context).width.kind).not.toBe("fraction");
});

test.each(["ltr", "rtl"])(
  "app aligns a fraction to its %s parent, independently of the child's direction",
  (direction) => {
    const doc: LayoutDoc = {
      version: LAYOUT_DOC_VERSION,
      source: "fraction.html",
      combo: { screen: "fraction", theme: "light" },
      size: { w: 300, h: 100 },
      viewport: { x: 0, y: 0, w: 300, h: 100 },
      conditions: [],
      dpr: 1,
      canvas: "white",
      fonts: [],
      root: {
        id: "root",
        tag: "main",
        attrs: {},
        styles: { display: "block", direction },
        bounds: { x: 0, y: 0, w: 300, h: 100 },
        preferredSize: { width: "300px", height: "100px" },
        children: [
          {
            id: "half",
            tag: "div",
            attrs: {},
            styles: { display: "block", direction: "ltr", "background-color": "rgb(220, 80, 60)" },
            bounds: { x: direction === "rtl" ? 150 : 0, y: 0, w: 150, h: 40 },
            preferredSize: { width: "50%", height: "40px" },
            children: [],
          },
        ],
      },
    };
    const app = compileLayout(doc, { name: "FractionView", mode: "app" }).code;
    const modifier = `.markswiftFraction(0.5${direction === "rtl" ? ", right: true" : ""})`;
    expect(app).toContain(modifier);
    expect(app.indexOf(".background(")).toBeGreaterThan(-1);
    expect(app.indexOf(".background(")).toBeLessThan(app.indexOf(modifier));
    const fidelity = compileLayout(doc, { name: "FractionView", mode: "fidelity" });
    expect(fidelity.code).toContain(".frame(width: 150.0");
    expect(fidelity.code).not.toContain("markswiftFraction");
    expect(fidelity.diagnostics.flatMap((d) => d.diagnostics).map((d) => d.message)).toContain(
      "width 50% pinned at 150px; it does not follow the container at other widths",
    );
  },
);
