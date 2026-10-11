import { describe, expect, test } from "bun:test";
import { flexGrowthSize } from "../../../src/analysis/flex-sizing.ts";
import type { InferenceContext } from "../../../src/analysis/context.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
import type { Axis, Diagnostic } from "../../../src/model/semantic.ts";

function item(axis: Axis, size: number, grow: number, styles: Record<string, string> = {}): LayoutNode {
  return {
    tag: "div",
    attrs: {},
    children: [],
    bounds: { x: 0, y: 0, w: axis === "h" ? size : 300, h: axis === "v" ? size : 300 },
    styles: { display: "block", "flex-grow": String(grow), ...styles },
  };
}

function context(axis: Axis, children: LayoutNode[], display = "flex"): InferenceContext {
  const parent: LayoutNode = {
    tag: "div",
    attrs: {},
    children,
    bounds: { x: 0, y: 0, w: 300, h: 300 },
    styles: { display, "flex-direction": axis === "h" ? "row" : "column" },
  };
  return { root: parent, fixed: [], bundledFamilies: {}, parent, parentAxis: axis, parentDisplay: display };
}

for (const axis of ["h", "v"] as const) {
  describe(`${axis === "h" ? "row" : "column"} flex growth`, () => {
    test("equal grow factors and equal measured sizes retain native fill", () => {
      const a = item(axis, 150, 1),
        b = item(axis, 150, 1);
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(a, axis, context(axis, [a, b]), diagnostics)).toEqual({ kind: "fill" });
      expect(diagnostics).toEqual([]);
    });

    test("fractional browser rounding within one pixel retains native fill", () => {
      const a = item(axis, 149.625, 1),
        b = item(axis, 150.375, 1);
      expect(flexGrowthSize(a, axis, context(axis, [a, b]), [])).toEqual({ kind: "fill" });
    });

    test("equal grow factors with unequal basis allocation preserve measured size", () => {
      const a = item(axis, 200, 1, { "flex-basis": "100px" });
      const b = item(axis, 100, 1, { "flex-basis": "0px" });
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(a, axis, context(axis, [a, b]), diagnostics)).toEqual({ kind: "fixed", px: 200 });
      const messages = diagnostics.map((d) => d.message).join(" ");
      expect(messages).toContain("unequal measured");
      expect(messages).toContain("basis");
      expect(messages).toContain("[200,100]");
    });

    test("unequal grow ratios preserve measured size rather than equal native shares", () => {
      const a = item(axis, 100, 1),
        b = item(axis, 200, 2);
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(b, axis, context(axis, [a, b]), diagnostics)).toEqual({ kind: "fixed", px: 200 });
      const messages = diagnostics.map((d) => d.message).join(" ");
      expect(messages).toContain("unequal flex-grow");
      expect(messages).toContain("[1,2]");
    });

    test("partial total growth preserves unused CSS space", () => {
      const a = item(axis, 75, 0.25),
        b = item(axis, 75, 0.25);
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(a, axis, context(axis, [a, b]), diagnostics)).toEqual({ kind: "fixed", px: 75 });
      expect(diagnostics.map((d) => d.message).join(" ")).toContain("total 0.5 < 1");
    });

    test("a lone half grower beside a fixed sibling preserves its partial allocation", () => {
      const a = item(axis, 120, 0.5),
        fixed = item(axis, 60, 0);
      expect(flexGrowthSize(a, axis, context(axis, [a, fixed]), [])).toEqual({ kind: "fixed", px: 120 });
    });

    test("a lone full grower beside a fixed sibling consumes the remaining space", () => {
      const a = item(axis, 240, 1),
        fixed = item(axis, 60, 0);
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(a, axis, context(axis, [a, fixed]), diagnostics)).toEqual({ kind: "fill" });
      expect(diagnostics).toEqual([]);
    });

    test("fixed/absolute/hidden nodes and text do not participate in grow ratios", () => {
      const a = item(axis, 150, 1),
        b = item(axis, 150, 1);
      const text = { ...item(axis, 40, 9), tag: "#text" };
      const excluded = [
        item(axis, 40, 9, { position: "absolute" }),
        item(axis, 40, 9, { position: "fixed" }),
        item(axis, 40, 9, { display: "none" }),
        text,
      ];
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(a, axis, context(axis, [a, ...excluded, b]), diagnostics)).toEqual({ kind: "fill" });
      expect(diagnostics).toEqual([]);
    });

    test.each(["absolute", "fixed"])("a %s-positioned element is not itself a flex grower", (position) => {
      const a = item(axis, 150, 1, { position });
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(a, axis, context(axis, [a]), diagnostics)).toBeUndefined();
      expect(diagnostics).toEqual([]);
    });

    test("a hidden element and a non-grower are outside growth handling", () => {
      const hidden = item(axis, 0, 1, { display: "none" }),
        fixed = item(axis, 60, 0);
      const ctx = context(axis, [hidden, fixed]);
      expect(flexGrowthSize(hidden, axis, ctx, [])).toBeUndefined();
      expect(flexGrowthSize(fixed, axis, ctx, [])).toBeUndefined();
    });

    test.each(["block", "grid"])("positive flex-grow in a %s parent has no effect", (display) => {
      const a = item(axis, 100, 1);
      const diagnostics: Diagnostic[] = [];
      expect(flexGrowthSize(a, axis, context(axis, [a], display), diagnostics)).toBeUndefined();
      expect(diagnostics).toEqual([]);
    });

    test("growth handling only applies on the parent's main axis", () => {
      const a = item(axis, 150, 1);
      expect(flexGrowthSize(a, axis === "h" ? "v" : "h", context(axis, [a]), [])).toBeUndefined();
    });
  });
}

test("unequal shrink allocation pins the browser's fractional measured size", () => {
  const a = item("h", 166.66667, 1, { "flex-basis": "200px", "flex-shrink": "1" });
  const b = item("h", 133.33333, 1, { "flex-basis": "200px", "flex-shrink": "2" });
  const diagnostics: Diagnostic[] = [];
  expect(flexGrowthSize(a, "h", context("h", [a, b]), diagnostics)).toEqual({ kind: "fixed", px: 166.67 });
  expect(diagnostics.map((d) => d.message).join(" ")).toContain("shrink");
});

test("a grower without a flex parent remains outside growth handling", () => {
  const a = item("h", 150, 1);
  expect(flexGrowthSize(a, "h", { root: a, fixed: [], bundledFamilies: {} }, [])).toBeUndefined();
});

test("inline-flex follows the same allocation rule", () => {
  const a = item("h", 150, 1),
    b = item("h", 150, 1);
  expect(flexGrowthSize(a, "h", context("h", [a, b], "inline-flex"), [])).toEqual({ kind: "fill" });
});
