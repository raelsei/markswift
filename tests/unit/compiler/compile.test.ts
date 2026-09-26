import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

const layout: LayoutDoc = {
  version: 1, source: "component.html", combo: { screen: "card", theme: "light", demoState: "normal" },
  size: { w: 200, h: 80 }, dpr: 1, canvas: "rgb(255, 255, 255)", fonts: [],
  root: { id: "root", tag: "main", attrs: {}, styles: { display: "block", "background-color": "rgb(255, 0, 0)" }, bounds: { x: 0, y: 0, w: 200, h: 80 }, children: [] },
};

test("captured-layout compilation is deterministic and does not mutate the input", () => {
  const before = structuredClone(layout);
  const first = compileLayout(layout, { name: "CardView" });
  expect(first).toEqual(compileLayout(layout, { name: "CardView" }));
  expect(layout).toEqual(before);
  expect(first.files["CardView.swift"]).toBe(first.code);
  expect(first.code).toContain("struct CardView: View");
  expect(Object.keys(first.files)).toHaveLength(4);
  expect(first.mapping).toEqual({ total: 1, mapped: 1, approximated: 0, unmapped: 0 });
});

test("serialized CSS sizing intent survives public compilation without changing legacy captures", () => {
  const input = structuredClone(layout);
  input.root.children = [{
    id: "section", tag: "section", attrs: {}, styles: { display: "block" },
    preferredSize: { width: "100px", height: "40px" }, bounds: { x: 0, y: 0, w: 100, h: 40 },
    children: [{ tag: "div", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 100, h: 40 }, children: [] }],
  }];
  const restored = JSON.parse(JSON.stringify(input));
  const before = structuredClone(restored);
  for (const mode of ["app", "fidelity"] as const) {
    expect(compileLayout(restored, { mode }).code).toContain("width: 100.0, height: 40.0");
  }
  expect(restored).toEqual(before);
  expect(() => compileLayout(layout)).not.toThrow();
});

test("invalid and conflicting type names cannot corrupt output files or Swift types", () => {
  for (const name of ["../View", "bad name", "1Card", "Self", "View", "Text", "Color", "Calendar", "DateComponents", "UIImage", "UIFont", "UIFontDescriptor", "StrokeStyle", "AsyncImage", "DesignSupport", "DesignTokens", "MarkswiftShapes"]) {
    expect(() => compileLayout(layout, { name })).toThrow();
  }
});

test("HTML metadata containing newlines remains inside generated comments", () => {
  const input = structuredClone(layout);
  input.source = "part\ninjected";
  input.root.id = "root\r\ninjected";
  const output = compileLayout(input);
  expect(output.code).not.toMatch(/^injected/m);
  expect(output.code).toContain("Source: part injected");
});
