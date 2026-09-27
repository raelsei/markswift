import { expect, test } from "bun:test";
import { definiteFlexInlineSize, percentageBasis } from "../../../src/analysis/flex-basis.ts";
import { PreferredSize, type LayoutNode } from "../../../src/model/layout.ts";

const node = (width: string, styles: Record<string, string> = {}): LayoutNode => ({
  tag: "div", attrs: {}, children: [], bounds: { x: 0, y: 0, w: 390, h: 100 },
  styles: { display: "block", ...styles }, preferredSize: { width, height: "auto" },
});

test("authored percentages retain fractional precision and values above one hundred percent", () => {
  expect(percentageBasis("33.3333%")).toBe(0.333333);
  expect(percentageBasis(".5%")).toBe(0.005);
  expect(percentageBasis("125%")).toBe(1.25);
  for (const value of ["calc(50% - 10px)", "-5%", "auto", "50px", "NaN%", "1e2%"]) {
    expect(percentageBasis(value)).toBeUndefined();
  }
});

test("legacy auto roots stay indefinite while explicit pixel-root block chains can be proven", () => {
  const root = node("auto"), child = node("auto", { display: "flex" });
  root.children = [child];
  const ctx = { root, bundledFamilies: {}, fixed: [] };
  expect(definiteFlexInlineSize(root, ctx)).toBe(false);
  expect(definiteFlexInlineSize(child, ctx)).toBe(false);
  root.preferredSize!.width = "390px";
  expect(definiteFlexInlineSize(child, ctx)).toBe(true);
  root.styles.display = "inline-flex";
  expect(definiteFlexInlineSize(child, ctx)).toBe(false);
  child.preferredSize!.inlineSizeDefinite = true;
  expect(definiteFlexInlineSize(child, ctx)).toBe(true);
  child.preferredSize!.inlineSizeDefinite = false;
  expect(definiteFlexInlineSize(child, ctx)).toBe(false);
});

test("definiteness serializes without requiring it in legacy captures", () => {
  const legacy = { width: "auto", height: "auto" };
  expect(PreferredSize.parse(legacy)).toEqual(legacy);
  const size = { ...legacy, inlineSizeDefinite: false, hasRelativePadding: true };
  expect(PreferredSize.parse(JSON.parse(JSON.stringify(size)))).toEqual(size);
});
