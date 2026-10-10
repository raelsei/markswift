import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { emitSwift } from "../../../src/swift/emit.ts";

test("SVG chart labels and nested tspans use the conversion's bundled fonts", () => {
  const styles = { "font-family": '"Geist Variable", sans-serif', "font-size": "12px", "font-weight": "400", fill: "rgb(0, 0, 0)" };
  const text = (value: string): LayoutNode => ({ tag: "#text", attrs: {}, styles, bounds: { x: 0, y: 0, w: 24, h: 12 }, text: value, children: [] });
  const root: LayoutNode = {
    tag: "svg", attrs: { viewbox: "0 0 100 50" }, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 100, h: 50 },
    children: [{ tag: "text", attrs: { x: "0", y: "12" }, styles, bounds: { x: 0, y: 0, w: 48, h: 12 }, children: [
      text("Jan"), { tag: "tspan", attrs: { x: "24" }, styles, bounds: { x: 24, y: 0, w: 24, h: 12 }, children: [text("Feb")] },
    ] }],
  };
  const doc: LayoutDoc = { version: 2, source: "chart", combo: { screen: "chart", theme: "light" }, size: { w: 100, h: 50 }, dpr: 1, canvas: "rgb(255, 255, 255)", fonts: [], root };
  const custom = inferScreen(doc, "chart", { bundledFamilies: { "Geist Variable": { weight: [100, 900] } } });
  const fallback = inferScreen(doc, "chart");
  expect(custom.root.kind).toBe("svg");
  if (custom.root.kind !== "svg" || fallback.root.kind !== "svg") throw new Error("Expected SVG roots");
  expect(custom.root.texts?.map((t) => t.font.family)).toEqual([
    { kind: "custom", name: "Geist Variable" }, { kind: "custom", name: "Geist Variable" },
  ]);
  expect(fallback.root.texts?.every((t) => t.font.family.kind === "system")).toBe(true);
  expect(emitSwift(custom, "ChartView", { mode: "app" }).view).toContain('.custom("Geist Variable"');
});
