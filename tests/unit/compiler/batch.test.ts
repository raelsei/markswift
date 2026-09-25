import { expect, test } from "bun:test";
import { compileLayouts } from "../../../src/index.ts";
import type { LayoutDoc } from "../../../src/compiler/index.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

function layout(name: string, color: string): LayoutDoc {
  const child = (id: string): LayoutNode => ({
    id, tag: "div", attrs: { style: "background:var(--brand)" },
    styles: { display: "block", "background-color": color },
    bounds: { x: 0, y: 0, w: 40, h: 20 }, children: [],
  });
  return {
    version: 1, source: `${name}.html`, combo: { screen: "card", theme: "light", demoState: "normal" },
    size: { w: 80, h: 40 }, dpr: 1, canvas: "white", fonts: [],
    root: { id: "root", tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 80, h: 40 }, children: [child("one"), child("two")] },
  };
}

test("multi-layout bundle shares runtime and gives identical hints with different colors distinct token values", () => {
  const bundle = compileLayouts([
    { layout: layout("alpha", "rgb(255, 0, 0)"), name: "AlphaView" },
    { layout: layout("beta", "rgb(0, 0, 255)"), name: "BetaView" },
  ]);
  expect(bundle.views.map(view => view.name)).toEqual(["AlphaView", "BetaView"]);
  expect(Object.keys(bundle.files).sort()).toEqual(["AlphaView.swift", "BetaView.swift", "MarkswiftRuntime.swift", "MarkswiftShapes.swift", "MarkswiftTokens.swift"].sort());
  const tokens = bundle.files["MarkswiftTokens.swift"]!;
  const names = bundle.views.map(view => [...view.code.matchAll(/Color\.([a-zA-Z][a-zA-Z0-9]*)/g)]
    .map(match => match[1]!).find(name => name !== "markswift" && name !== "clear"));
  expect(names[0]).toBeDefined();
  expect(names[1]).toBeDefined();
  expect(names[0]).not.toBe(names[1]);
  expect(tokens).toContain(`static let ${names[0]} = Color.markswift(1.0, 0.0, 0.0)`);
  expect(tokens).toContain(`static let ${names[1]} = Color.markswift(0.0, 0.0, 1.0)`);
  expect(bundle.files["AlphaView.swift"]).toBe(bundle.views[0]!.code);
  expect(bundle.files["BetaView.swift"]).toBe(bundle.views[1]!.code);
});

test("componentId pairs light and dark captures under one semantic color token", () => {
  const light = layout("card-light", "rgb(255, 0, 0)");
  const dark = { ...layout("card-dark", "rgb(0, 0, 255)"), combo: { screen: "card", theme: "dark" as const, demoState: "normal" } };
  const bundle = compileLayouts([
    { layout: light, name: "CardLightView", componentId: "card" },
    { layout: dark, name: "CardDarkView", componentId: "card" },
  ]);
  const token = bundle.files["MarkswiftTokens.swift"]!.match(/static let (\w+) = Color\(light: \.markswift\(1\.0, 0\.0, 0\.0\), dark: \.markswift\(0\.0, 0\.0, 1\.0\)\)/)?.[1];
  expect(token).toBeDefined();
  expect(bundle.files["CardLightView.swift"]).toContain(`Color.${token}`);
  expect(bundle.files["CardDarkView.swift"]).toContain(`Color.${token}`);
  expect(bundle.files["MarkswiftTokens.swift"]).toContain("semantic (light/dark pairs)");
});

test("componentId rejects duplicate captures of the same theme", () => {
  expect(() => compileLayouts([
    { layout: layout("first", "red"), name: "CardOneView", componentId: "card" },
    { layout: layout("second", "blue"), name: "CardTwoView", componentId: "card" },
  ])).toThrow("Duplicate component theme: card (light)");
  expect(() => compileLayouts([{ layout: layout("first", "red"), name: "CardView", componentId: " " }])).toThrow("componentId must be a non-empty string");
});

test("batch rejects empty inputs and colliding Swift view names", () => {
  expect(() => compileLayouts([])).toThrow("at least one");
  expect(() => compileLayouts([
    { layout: layout("first", "red"), name: "CardView" },
    { layout: layout("second", "blue"), name: "CardView" },
  ])).toThrow("Duplicate view name");
  expect(() => compileLayouts([
    { layout: layout("first", "red"), name: "CardView" },
    { layout: layout("second", "blue"), name: "CardVIEW" },
  ])).toThrow("Duplicate view name");
});

test("batch deduplicates equal assets and rejects conflicting font and resource paths", () => {
  const first = { layout: layout("first", "red"), name: "FirstView", assets: { "Fonts/Shared.ttf": Uint8Array.of(1, 2, 3) } };
  const second = { layout: layout("second", "blue"), name: "SecondView", assets: { "Fonts/Shared.ttf": Uint8Array.of(1, 2, 3) } };
  expect(compileLayouts([first, second]).assets["Fonts/Shared.ttf"]).toEqual(Uint8Array.of(1, 2, 3));
  expect(() => compileLayouts([first, { ...second, assets: { "Fonts/Shared.ttf": Uint8Array.of(4) } }])).toThrow("Conflicting asset: Fonts/Shared.ttf");
  expect(() => compileLayouts([first, { ...second, assets: { "fonts/shared.ttf": Uint8Array.of(1, 2, 3) } }])).toThrow("Case-insensitive output path collision");
  const fontFile = { "Font+Markswift.swift": "enum MarkswiftBundledFonts {}" };
  expect(() => compileLayouts([
    { ...first, supportFiles: fontFile },
    { ...second, supportFiles: { "Font+Markswift.swift": "enum MarkswiftBundledFonts { static let x = 1 }" } },
  ])).toThrow("Conflicting support file: Font+Markswift.swift");
});

test("batch rejects file paths that also need to be output directories", () => {
  const base = { layout: layout("card", "red"), name: "CardView" };
  const bytes = Uint8Array.of(1);
  const collision = "Output path collision (file/directory)";
  expect(() => compileLayouts([{ ...base, supportFiles: { Fonts: "file" }, assets: { "Fonts/icon.ttf": bytes } }])).toThrow(collision);
  expect(() => compileLayouts([{ ...base, assets: { "Fonts/icon.ttf": bytes, Fonts: bytes } }])).toThrow(collision);
  expect(() => compileLayouts([{ ...base, assets: { "fonts/icon.ttf": bytes, Fonts: bytes } }])).toThrow(collision);
  expect(() => compileLayouts([{ ...base, supportFiles: { "MarkswiftRuntime.swift/nested": "file" } }])).toThrow(collision);
});
