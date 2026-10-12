/** Plan 037: a probe capture at another width keeps admitted runtime layouts only when it reproduces them. */
import { expect, test } from "bun:test";
import { type CompileResult, compileLayout, needsProbe } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const BOX = { display: "block", "box-sizing": "border-box", "background-color": "rgb(220, 80, 60)" };

function doc(root: LayoutNode, screen = "probe"): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "probe.html",
    combo: { screen, theme: "light" },
    size: { w: root.bounds.w, h: root.bounds.h },
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
}

/** A `flex: 1 0 0px` / `flex: 2 0 0px` row (gap 8) with the captured item widths. */
function flexRow(width: number, widths: [number, number], screen?: string): LayoutDoc {
  const items: LayoutNode[] = widths.map((w, i) => ({
    id: `item${i}`,
    tag: "div",
    attrs: {},
    preferredSize: { width: "auto", height: "auto" },
    bounds: { x: i === 0 ? 0 : widths[0] + 8, y: 0, w, h: 40 },
    children: [],
    styles: {
      ...BOX,
      "flex-grow": String(i + 1),
      "flex-shrink": "0",
      "flex-basis": "0px",
      "min-width": "0px",
      "max-width": "none",
    },
  }));
  const row: LayoutNode = {
    id: "row",
    tag: "div",
    attrs: {},
    preferredSize: { width: "auto", height: "auto" },
    bounds: { x: 0, y: 0, w: width, h: 40 },
    children: items,
    styles: { display: "flex", "flex-direction": "row", "flex-wrap": "nowrap", "column-gap": "8px" },
  };
  return doc(
    { id: "root", tag: "main", attrs: {}, bounds: { x: 0, y: 0, w: width, h: 40 }, children: [row], styles: BOX },
    screen,
  );
}

/** A `1fr 2fr` grid root (padding-left 12, gap 10) with the captured column widths. */
function frGrid(width: number, widths: [number, number]): LayoutDoc {
  const children: LayoutNode[] = widths.map((w, i) => ({
    id: `cell${i}`,
    tag: "div",
    attrs: {},
    preferredSize: { width: "auto", height: "auto" },
    bounds: { x: 12 + (i === 0 ? 0 : widths[0] + 10), y: 8, w, h: 20 },
    styles: BOX,
    children: [],
  }));
  return doc({
    id: "root",
    tag: "main",
    attrs: {},
    preferredSize: { width: `${width}px`, height: "200px", gridTemplateColumns: "1fr 2fr" },
    bounds: { x: 0, y: 0, w: width, h: 200 },
    children,
    styles: {
      display: "grid",
      "grid-template-columns": widths.map((w) => `${w}px`).join(" "),
      "grid-template-rows": "20px",
      "column-gap": "10px",
      "row-gap": "10px",
      "padding-left": "12px",
      "padding-top": "8px",
    },
  });
}

const app = (layout: LayoutDoc, probe: LayoutDoc) => compileLayout(layout, { name: "ProbeView", mode: "app", probe });
const features = (r: CompileResult, id: string) =>
  r.diagnostics.filter((d) => d.id === id).flatMap((d) => d.diagnostics.map((x) => x.feature));

const P1 = flexRow(340, [110.67, 221.33]);

test("a probe that follows the flex solver keeps MarkswiftFlexRow", () => {
  expect(needsProbe(P1)).toBe(true);
  expect(app(P1, flexRow(290, [94, 188])).code).toContain("MarkswiftFlexRow(");
});

test("a probe the flex solver does not reproduce pins the row with a diagnostic", () => {
  const result = app(P1, flexRow(290, [141, 141]));
  expect(result.code).not.toContain("MarkswiftFlexRow(");
  expect(features(result, "row")).toContain("flex-grow");
});

test("the same holds for an admitted 1fr 2fr grid", () => {
  const grid = frGrid(360, [112.67, 225.33]);
  expect(needsProbe(grid)).toBe(true);
  expect(app(grid, frGrid(300, [92.67, 185.33])).code).toContain("MarkswiftTracks(");
  const pinned = app(grid, frGrid(300, [139, 139]));
  expect(pinned.code).not.toContain("MarkswiftTracks(");
  expect(features(pinned, "root")).toContain("grid-template-columns");
});

test("a probe of another screen is rejected", () => {
  expect(() => app(P1, flexRow(290, [94, 188], "other"))).toThrow(
    "options.probe must be a capture of the same screen and theme at another width",
  );
});
