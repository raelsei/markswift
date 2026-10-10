import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

const layout: LayoutDoc = {
  version: 2, source: "component.html", combo: { screen: "card", theme: "light" },
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
  expect(Object.keys(first.files)).toEqual(["CardView.swift", "MarkswiftRuntime.swift", "CardView+Tokens.swift"]);
});

test("two conversions share only the identical runtime file", () => {
  const a = compileLayout(layout, { name: "CardA" }), b = compileLayout(layout, { name: "CardB" });
  const shared = Object.keys(a.files).filter((f) => f in b.files);
  expect(shared).toEqual(["MarkswiftRuntime.swift"]);
  expect(a.files["MarkswiftRuntime.swift"]).toBe(b.files["MarkswiftRuntime.swift"]!);
  for (const [file, src] of Object.entries(a.files)) {
    if (file !== "MarkswiftRuntime.swift") expect(src).toMatch(/\b(struct|extension) CardA\b/);
    expect(src).not.toMatch(/^extension Color \{\n\s+static let /m);
  }
});

test("serialized CSS sizing intent survives public compilation", () => {
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
  for (const name of ["../View", "bad name", "1Card", "Self", "View", "Text", "Color", "UIImage", "UIFont", "UIFontDescriptor", "StrokeStyle", "AsyncImage", "MarkswiftShapes"]) {
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
