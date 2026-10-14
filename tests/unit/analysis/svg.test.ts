import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { svgFromDataUrl, svgFromMarkup } from "../../../src/analysis/svg/markup.ts";
import { imagePaint } from "../../../src/analysis/style-background.ts";
import { pathBounds } from "../../../src/analysis/svg/geometry.ts";

test("SVG chart labels and nested tspans use the conversion's bundled fonts", () => {
  const styles = {
    "font-family": '"Geist Variable", sans-serif',
    "font-size": "12px",
    "font-weight": "400",
    fill: "rgb(0, 0, 0)",
  };
  const text = (value: string): LayoutNode => ({
    tag: "#text",
    attrs: {},
    styles,
    bounds: { x: 0, y: 0, w: 24, h: 12 },
    text: value,
    children: [],
  });
  const root: LayoutNode = {
    tag: "svg",
    attrs: { viewbox: "0 0 100 50" },
    styles: { display: "block" },
    bounds: { x: 0, y: 0, w: 100, h: 50 },
    children: [
      {
        tag: "text",
        attrs: { x: "0", y: "12" },
        styles,
        bounds: { x: 0, y: 0, w: 48, h: 12 },
        children: [
          text("Jan"),
          { tag: "tspan", attrs: { x: "24" }, styles, bounds: { x: 24, y: 0, w: 24, h: 12 }, children: [text("Feb")] },
        ],
      },
    ],
  };
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "chart",
    combo: { screen: "chart", theme: "light" },
    size: { w: 100, h: 50 },
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
  const custom = inferScreen(doc, "chart", { bundledFamilies: { "Geist Variable": { weight: [100, 900] } } });
  const fallback = inferScreen(doc, "chart");
  expect(custom.root.kind).toBe("svg");
  if (custom.root.kind !== "svg" || fallback.root.kind !== "svg") throw new Error("Expected SVG roots");
  expect(custom.root.texts?.map((t) => t.font.family)).toEqual([
    { kind: "custom", name: "Geist Variable" },
    { kind: "custom", name: "Geist Variable" },
  ]);
  expect(fallback.root.texts?.every((t) => t.font.family.kind === "system")).toBe(true);
  expect(emitSwift(custom, "ChartView", { mode: "app" }).view).toContain('.custom("Geist Variable"');
});

describe("BUG-03 markup SVG paints like the browser", () => {
  // Markup (`<img src=*.svg>`, data: backgrounds) has no computed style: the SVG initial values,
  // named colours, `currentColor` and inline `style` have to be resolved from attributes.
  const FRAME = { x: 0, y: 0, w: 10, h: 10 };
  const BLACK = { r: 0, g: 0, b: 0, a: 1 };
  const draw = (markup: string) => svgFromMarkup(markup, FRAME)!;

  test("an unfilled shape paints black", () => {
    expect(draw('<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>').paths[0]!.fill).toEqual(BLACK);
  });
  test("named colours resolve", () => {
    expect(draw('<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="white"/></svg>').paths[0]!.fill).toEqual({
      r: 1,
      g: 1,
      b: 1,
      a: 1,
    });
  });
  test("currentColor follows the inherited color attribute, black by default", () => {
    expect(
      draw('<svg viewBox="0 0 10 10"><path d="M0 0L10 10" fill="none" stroke="currentColor"/></svg>').paths[0]!.stroke,
    ).toEqual(BLACK);
    expect(
      draw('<svg viewBox="0 0 10 10"><g color="red"><path d="M0 0L10 10" fill="none" stroke="currentColor"/></g></svg>')
        .paths[0]!.stroke,
    ).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
  test("an inline style declaration applies", () => {
    expect(draw('<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z" style="fill:#ff0000"/></svg>').paths[0]!.fill).toEqual({
      r: 1,
      g: 0,
      b: 0,
      a: 1,
    });
  });
  test("<style> rules and classes are reported", () => {
    const node = draw('<svg viewBox="0 0 10 10"><style>.a{fill:red}</style><path class="a" d="M0 0H10V10Z"/></svg>');
    expect(node.confidence).toBe("unmapped");
    expect(node.diagnostics).toContainEqual(expect.objectContaining({ level: "unmapped", feature: "style" }));
  });
  test("text takes its font size from attributes", () => {
    expect(
      svgFromMarkup('<svg viewBox="0 0 100 20"><text x="0" y="15" font-size="12">Hi</text></svg>', {
        x: 0,
        y: 0,
        w: 100,
        h: 20,
      })!.texts![0]!.font.size,
    ).toBe(12);
  });
});

describe("BUG-14 SVG groups, nested viewports and object-bounding-box clips", () => {
  const FRAME = { x: 0, y: 0, w: 20, h: 20 };
  const draw = (markup: string) => svgFromMarkup(markup, FRAME)!;

  test("a group clip-path applies to the shapes below it", () => {
    const p = draw(
      '<svg viewBox="0 0 10 10"><defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs><g clip-path="url(#c)"><rect width="10" height="10" fill="red"/></g></svg>',
    ).paths[0]!;
    expect(p.clip).toBeDefined();
    expect(pathBounds(p.clip!.path)).toEqual({ x: 0, y: 0, w: 5, h: 5 });
  });
  test("a group mask applies to the shapes below it", () => {
    const p = draw(
      '<svg viewBox="0 0 10 10"><defs><mask id="m"><rect width="5" height="5" fill="white"/></mask></defs><g mask="url(#m)"><rect width="10" height="10" fill="red"/></g></svg>',
    ).paths[0]!;
    expect(p.mask?.length).toBe(1);
  });
  test("filters, markers and foreignObject are reported", () => {
    const node = draw(
      '<svg viewBox="0 0 10 10"><defs><filter id="f"/><marker id="m"/></defs><g filter="url(#f)"><path d="M0 0L10 10" stroke="red" marker-end="url(#m)"/></g><foreignObject width="5" height="5"><div>x</div></foreignObject></svg>',
    );
    for (const feature of ["svg:filter", "svg:marker", "svg:foreignObject"])
      expect(node.diagnostics).toContainEqual(expect.objectContaining({ level: "unmapped", feature }));
  });
  test("a nested <svg> is its own viewport", () => {
    const p = draw(
      '<svg viewBox="0 0 20 20"><svg x="10" width="10" height="10" viewBox="0 0 100 100"><rect width="100" height="100"/></svg></svg>',
    ).paths[0]!;
    expect(pathBounds(p.path)).toEqual({ x: 10, y: 0, w: 10, h: 10 });
  });
  test("an objectBoundingBox clip applies the transform once", () => {
    const p = draw(
      '<svg viewBox="0 0 20 20"><defs><clipPath id="o" clipPathUnits="objectBoundingBox"><rect width="0.5" height="1"/></clipPath></defs><g transform="translate(5,0)"><rect width="4" height="4" clip-path="url(#o)"/></g></svg>',
    ).paths[0]!;
    const b = pathBounds(p.clip!.path);
    expect(b.x).toBeCloseTo(5, 5);
    expect(b.w).toBeCloseTo(2, 5);
  });
});

test("path data is normalised once, during analysis, into absolute segments", () => {
  const path: LayoutNode = {
    tag: "path",
    attrs: { d: "m4 4 h16 v16 z" },
    styles: {},
    bounds: { x: 4, y: 4, w: 16, h: 16 },
    children: [],
  };
  const root: LayoutNode = {
    tag: "svg",
    attrs: { viewbox: "0 0 24 24" },
    styles: { display: "block" },
    bounds: { x: 0, y: 0, w: 24, h: 24 },
    children: [path],
  };
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "icon",
    combo: { screen: "icon", theme: "light" },
    size: { w: 24, h: 24 },
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
  const svg = inferScreen(doc, "icon").root;
  if (svg.kind !== "svg") throw new Error("expected an svg root");
  expect(svg.paths[0]!.path).toEqual([["M", 4, 4], ["H", 20], ["V", 20], ["Z"]]);
  // Each clip shape is normalised on its own: a relative `m` starts from its own origin, not the previous shape's.
  const clipped = svgFromMarkup(
    '<svg viewBox="0 0 100 40"><clipPath id="c"><path d="m10 10 h20 v20 h-20 z"/><path d="m60 10 h20 v20 h-20 z"/></clipPath><rect width="100" height="40" clip-path="url(#c)"/></svg>',
    { x: 0, y: 0, w: 100, h: 40 },
  )!;
  expect(pathBounds(clipped.paths[0]!.clip!.path)).toEqual({ x: 10, y: 10, w: 70, h: 20 });
});

describe("data: svg sources are parsed once, during analysis", () => {
  const doc = (root: LayoutNode): LayoutDoc => ({
    version: LAYOUT_DOC_VERSION,
    source: "t",
    combo: { screen: "t", theme: "light" },
    size: { w: root.bounds.w, h: root.bounds.h },
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  });

  test("intrinsic size: px width/height (one of them with the viewBox ratio); none for a viewBox-only or % svg", () => {
    const svg =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100' width='160' height='100'%3E%3C/svg%3E";
    expect(svgFromDataUrl(svg)!.intrinsic).toEqual({ w: 160, h: 100 });
    expect(svgFromDataUrl("data:image/svg+xml,%3Csvg viewBox='0 0 20 10'%3E%3C/svg%3E")!.intrinsic).toBeUndefined();
    expect(
      svgFromDataUrl("data:image/svg+xml,%3Csvg viewBox='0 0 20 10' width='100%25'%3E%3C/svg%3E")!.intrinsic,
    ).toBeUndefined();
    expect(svgFromDataUrl("data:image/svg+xml,%3Csvg viewBox='0 0 20 10' height='30'%3E%3C/svg%3E")!.intrinsic).toEqual(
      {
        w: 60,
        h: 30,
      },
    );
  });

  test("a viewBox-only background svg at `auto` size fits its positioning area (CSS: ratio, no size)", () => {
    const tall = "data:image/svg+xml,%3Csvg viewBox='0 0 100 200'%3E%3Crect width='100' height='200'/%3E%3C/svg%3E";
    const s = { "background-size": "auto", "background-position": "50% 50%", "background-repeat": "no-repeat" };
    expect(imagePaint(tall, s, "background", 0, 300, 100, [])).toMatchObject({
      size: { w: 50, h: 100 },
      position: [125, 0],
    });
  });

  test("svg data URL parsing: base64 payload, non-svg and remote URLs", () => {
    expect(
      svgFromDataUrl(`data:image/svg+xml;base64,${Buffer.from('<svg width="8px" height="4px"/>').toString("base64")}`)!
        .intrinsic,
    ).toEqual({ w: 8, h: 4 });
    expect(svgFromDataUrl("data:image/png;base64,AAAA")).toBeUndefined();
    expect(svgFromDataUrl("https://example.com/a.svg")).toBeUndefined();
  });

  const BG =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' width='40' height='20'%3E%3Crect width='10' height='10' fill='%2322aa55'/%3E%3C/svg%3E\")";
  const background = () =>
    inferScreen(
      doc({
        tag: "div",
        attrs: {},
        bounds: { x: 0, y: 0, w: 100, h: 60 },
        children: [],
        styles: {
          display: "block",
          "background-image": BG,
          "background-repeat": "no-repeat",
          "background-position": "50% 50%",
          "background-size": "auto",
        },
      }),
      "t",
    );

  test("a background svg carries its vector, placed by the width/height intrinsic size", () => {
    const fill = background().root.style.fills[0]!;
    expect(fill.kind).toBe("image");
    if (fill.kind !== "image") throw new Error("expected an image fill");
    expect(fill.vector?.viewBox).toEqual([0, 0, 10, 10]);
    expect(fill.size).toEqual({ w: 40, h: 20 });
    expect(fill.position).toEqual([30, 20]);
  });

  test("an <img> svg with neither viewBox nor size has no vector and says so", () => {
    const img: LayoutNode = {
      tag: "img",
      attrs: { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" },
      styles: {},
      bounds: { x: 0, y: 0, w: 48, h: 48 },
      children: [],
    };
    const root = inferScreen(
      doc({
        tag: "main",
        attrs: {},
        styles: { display: "block" },
        bounds: { x: 0, y: 0, w: 48, h: 48 },
        children: [img],
      }),
      "t",
    ).root;
    const node =
      root.kind === "image" ? root : "children" in root ? root.children.find((c) => c.kind === "image") : undefined;
    if (node?.kind !== "image") throw new Error("expected an image node");
    expect(node.vector).toBeUndefined();
    expect(node.diagnostics).toContainEqual(
      expect.objectContaining({ level: "unmapped", message: expect.stringContaining("svg data: URL has no viewBox") }),
    );
  });

  test("the emitter draws the parsed vector as Shapes, not as an image file", () => {
    const view = emitSwift(background(), "BgView", { mode: "app" }).view;
    expect(view).toContain(".frame(width:");
    expect(view).not.toContain("Image.markswift");
  });
});
