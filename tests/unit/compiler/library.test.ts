/** `compileLayouts`: many components, one module — one token set, module-level palette and shapes. */
import { expect, test } from "bun:test";
import { compileLayout, compileLayouts, type LayoutDoc, type LibraryComponent } from "../../../src/compiler/index.ts";
import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";

type Node = LayoutDoc["root"];
const box = (id: string, y: number, styles: Record<string, string>, attrs: Record<string, string> = {}): Node => ({
  id,
  tag: "div",
  attrs,
  styles: { display: "block", ...styles },
  bounds: { x: 0, y, w: 200, h: 20 },
  children: [],
});
const icon = (id: string, y: number): Node => ({
  id,
  tag: "svg",
  attrs: { viewbox: "0 0 24 24" },
  styles: { display: "block", width: "24px", height: "24px" },
  bounds: { x: 0, y, w: 24, h: 24 },
  children: [
    { tag: "path", attrs: { d: "m4 4 h16 v16 z" }, styles: {}, bounds: { x: 4, y: y + 4, w: 16, h: 16 }, children: [] },
  ],
});

function page(screen: string, theme: "light" | "dark", children: Node[]): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: `${screen}.html`,
    combo: { screen, theme },
    size: { w: 200, h: 100 },
    viewport: { x: 0, y: 0, w: 200, h: 100 },
    conditions: [],
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root: {
      id: "root",
      tag: "main",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 200, h: 100 },
      children,
    },
  };
}
/** A component whose two boxes paint `light` in light and `dark` in dark. */
const pair = (name: string, light: string, dark: string, extra: Node[] = []): LibraryComponent => ({
  name,
  layout: page(name, "light", [
    box("a", 0, { "background-color": light }),
    box("b", 20, { "background-color": light }),
    ...extra,
  ]),
  dark: page(name, "dark", [
    box("a", 0, { "background-color": dark }),
    box("b", 20, { "background-color": dark }),
    ...extra,
  ]),
});
const palette = (files: Record<string, string>) => files["MarkswiftPalette.swift"]!;

test("two components painting the same light/dark pair share one module-level token", () => {
  const lib = compileLayouts(
    [pair("A", "rgb(255, 255, 255)", "rgb(0, 0, 0)"), pair("B", "rgb(255, 255, 255)", "rgb(0, 0, 0)")],
    {
      library: "Kit",
    },
  );
  const decls = [...palette(lib.files).matchAll(/public static let (\w+) = Color\.markswift\(light:/g)].map(
    (m) => m[1]!,
  );
  expect(decls).toHaveLength(1);
  expect(lib.files["A.swift"]).toContain(`Palette.${decls[0]}`);
  expect(lib.files["B.swift"]).toContain(`Palette.${decls[0]}`);
});

test("one CSS variable hint naming two different colours never names both", () => {
  const hinted = (name: string, color: string): LibraryComponent => ({
    name,
    layout: page(name, "light", [
      box("a", 0, { "background-color": color }, { style: "background: var(--x)" }),
      box("b", 20, { "background-color": color }, { style: "background: var(--x)" }),
    ]),
  });
  const lib = compileLayouts([hinted("A", "rgb(255, 0, 0)"), hinted("B", "rgb(0, 0, 255)")], { library: "Kit" });
  const nameOf = (args: string) =>
    new RegExp(`static let (\\w+) = Color\\.markswift\\(${args}\\)`).exec(palette(lib.files))?.[1];
  const red = nameOf("1\\.0, 0\\.0, 0\\.0");
  const blue = nameOf("0\\.0, 0\\.0, 1\\.0");
  expect(red).toBeDefined();
  expect(blue).toBeDefined();
  expect(red).not.toBe(blue);
  expect([red, blue].filter((n) => n === "x").length).toBeLessThanOrEqual(1);
});

test("module-level files: one view per component, one palette, shapes and runtime, nothing nested", () => {
  const lib = compileLayouts(
    [
      pair("A", "rgb(255, 255, 255)", "rgb(0, 0, 0)", [icon("i", 40)]),
      pair("B", "rgb(250, 250, 250)", "rgb(9, 9, 9)", [icon("i", 40)]),
    ],
    { library: "Kit" },
  );
  expect(Object.keys(lib.files).sort()).toEqual([
    "A.swift",
    "B.swift",
    "MarkswiftPalette.swift",
    "MarkswiftRuntime.swift",
    "MarkswiftShapes.swift",
  ]);
  for (const [file, text] of Object.entries(lib.files)) {
    expect(text).not.toMatch(/extension (A|B) \{\n\s*enum Palette/);
    expect(text).not.toContain("do not edit");
    if (file === "A.swift" || file === "B.swift") {
      expect(text).toContain("regenerate with `markswift build`");
      expect(text).toMatch(/public struct (A|B): View/);
    }
  }
  expect(palette(lib.files)).toContain("public enum Palette {");
  // The identical icon in both components is one struct.
  expect(lib.files["MarkswiftShapes.swift"]!.match(/^nonisolated struct Markswift\w+/gm)).toHaveLength(1);
});

test("library names: duplicates ignoring case, a component named like the library and an empty list throw", () => {
  const one = (name: string) => pair(name, "rgb(255, 255, 255)", "rgb(0, 0, 0)");
  expect(() => compileLayouts([one("Card"), one("CARD")], { library: "Kit" })).toThrow("duplicate");
  expect(() => compileLayouts([one("Kit")], { library: "Kit" })).toThrow("named like the library");
  expect(() => compileLayouts([], { library: "Kit" })).toThrow("at least one component");
  expect(() => compileLayouts([one("A")], { library: "Palette" })).toThrow("library");
});

test("the same components compile to the same library twice", () => {
  const build = () =>
    compileLayouts(
      [pair("A", "rgb(255, 255, 255)", "rgb(0, 0, 0)"), pair("B", "rgb(1, 2, 3)", "rgb(4, 5, 6)", [icon("i", 40)])],
      {
        library: "Kit",
        registerFonts: true,
      },
    );
  expect(build()).toEqual(build());
  expect(build().files["A.swift"]).toContain("    BundledFonts.register()\n    return A()");
});

test("compileLayout keeps the palette nested in its view", () => {
  const c = pair("CardView", "rgb(255, 255, 255)", "rgb(0, 0, 0)");
  const single = compileLayout(c.layout, { name: "CardView", dark: c.dark });
  expect(single.files["CardView+Tokens.swift"]).toContain("extension CardView {\n    enum Palette {");
  expect(single.code).toContain("regenerate with `markswift convert --update`");
});

test("compile warnings are typed and carry the component, never a text prefix", () => {
  const drift = pair("B", "rgb(255, 255, 255)", "rgb(0, 0, 0)");
  drift.dark = page("B", "dark", [box("a", 0, { "background-color": "rgb(0, 0, 0)" })]);
  const lib = compileLayouts([pair("A", "rgb(255, 255, 255)", "rgb(0, 0, 0)"), drift], { library: "Kit" });
  expect(lib.warnings.length).toBeGreaterThan(0);
  expect(lib.warnings).toContainEqual(expect.objectContaining({ source: "adaptive", component: "B" }));
  expect(lib.warnings.every((w) => w.component === "B" && !w.message.startsWith("B: "))).toBe(true);
});

test("the unbound-colour warning names only the view whose node lost its token, though node ids repeat", () => {
  // One light colour pairing with two dark colours on node `n` (fill and shadow): the shadow cannot bind.
  const shadowed = (theme: "light" | "dark", fill: string, shadow: string) =>
    page("A", theme, [box("n", 0, { "background-color": fill, "box-shadow": `${shadow} 0px 2px 4px 0px` })]);
  const a: LibraryComponent = {
    name: "A",
    layout: shadowed("light", "rgb(250, 250, 250)", "rgb(250, 250, 250)"),
    dark: shadowed("dark", "rgb(0, 0, 0)", "rgb(90, 90, 90)"),
  };
  const b: LibraryComponent = {
    name: "B",
    layout: page("B", "light", [box("n", 0, { "background-color": "rgb(250, 250, 250)" })]),
    dark: page("B", "dark", [box("n", 0, { "background-color": "rgb(0, 0, 0)" })]),
  };
  const single = compileLayout(a.layout, { name: "A", dark: a.dark }).warnings;
  const lib = compileLayouts([a, b], { library: "Kit" }).warnings;
  expect(single.map((w) => w.message)).toEqual([expect.stringContaining("could not be bound")]);
  expect(lib).toEqual(single.map((w) => ({ ...w, component: "A" })));
});
