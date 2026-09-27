import { expect, test } from "bun:test";
import { markerPaintRect, buildListSymbol } from "../../../src/analysis/list-symbol.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
import { makeBase } from "../../../src/analysis/node-base.ts";

function marker(symbol: NonNullable<LayoutNode["markerLayout"]>["symbol"], ascent = 14): LayoutNode {
  return { id: "li/::marker", tag: "::marker", attrs: {}, styles: { display: "inline", color: "rgb(12, 34, 56)" },
    markerLayout: { symbol, fontAscent: ascent, fontDescent: 3, fontSize: 14 },
    bounds: { x: 24.5, y: 94, w: 7, h: ascent + 3 },
    children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: 24.5, y: 95, w: 7, h: ascent + 3 }, text: "• ", children: [] }] };
}

test("Chromium bullet geometry uses integer font ascent and actual text origin, then snaps CSS pixels", () => {
  const n = marker("disc");
  expect(markerPaintRect(n)).toEqual({ x: 1.5, y: 8, w: 5, h: 5 });
  expect(markerPaintRect(marker("square", 20))).toEqual({ x: 1.5, y: 11, w: 7, h: 7 });
});

test("disc/circle/square become native paths retaining measured layout, color and circle stroke", () => {
  for (const symbol of ["disc", "circle", "square"] as const) {
    const n = marker(symbol), ctx = { root: n, fixed: [], bundledFamilies: {} };
    const result = buildListSymbol(n, makeBase(n, ctx, {}))!;
    expect(result.kind).toBe("svg");
    expect(result.frame).toEqual(n.bounds);
    expect(result.paths).toHaveLength(1);
    expect(result.width).toEqual({ kind: "fixed", px: 7 });
    if (symbol === "circle") {
      expect(result.paths[0]!.fill).toBeUndefined();
      expect(result.paths[0]!.strokeWidth).toBe(1);
    } else expect(result.paths[0]!.fill).toEqual({ r: 12 / 255, g: 34 / 255, b: 56 / 255, a: 1 });
  }
});

test("missing metrics and mismatched font box stay on existing marker path", () => {
  const n = marker("disc"); delete n.markerLayout;
  expect(markerPaintRect(n)).toBeUndefined();
  const mismatched = marker("disc"); mismatched.children[0]!.bounds.h = 24;
  expect(markerPaintRect(mismatched)).toBeUndefined();
});

test("shape paint snaps before a fractional capture origin is subtracted", () => {
  const n = marker("disc"); n.markerLayout!.pixelOffset = { x: .25, y: .75 };
  expect(markerPaintRect(n)).toEqual({ x: 1.25, y: 8.25, w: 5, h: 5 });
});

test("only proved summary triangles receive dynamic disclosure state", () => {
  const n = marker("disclosure-open"); n.markerLayout!.disclosureControl = true;
  const ctx = { root: n, fixed: [], bundledFamilies: {} };
  const result = buildListSymbol(n, makeBase(n, ctx, {}))!;
  expect(result.disclosureSymbol?.capturedExpanded).toBe(true);
  n.markerLayout!.disclosureControl = undefined;
  expect(buildListSymbol(n, makeBase(n, ctx, {}))!.disclosureSymbol).toBeUndefined();
});
