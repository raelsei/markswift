import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
/** Adaptive compile: one light view whose colours follow the colour scheme, paired from a dark capture. */
import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

type Node = LayoutDoc["root"];
const box = (id: string, y: number, styles: Record<string, string>): Node => ({
  id,
  tag: "div",
  attrs: {},
  styles: { display: "block", ...styles },
  bounds: { x: 0, y, w: 200, h: 20 },
  children: [],
});

function page(theme: "light" | "dark", card: string, edge?: string): LayoutDoc {
  return {
    version: LAYOUT_DOC_VERSION,
    source: "card.html",
    combo: { screen: "card", theme },
    size: { w: 200, h: 100 },
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root: {
      id: "root",
      tag: "main",
      attrs: {},
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 200, h: 100 },
      children: [
        box("card", 0, { "background-color": card }),
        box("accent", 20, { "background-color": "rgb(0, 128, 255)" }),
        box("accent2", 40, { "background-color": "rgb(0, 128, 255)" }),
        box("lone", 60, { "background-color": "rgb(51, 178, 77)" }),
        box(
          "edge",
          80,
          edge ? { "border-top-style": "solid", "border-top-width": "2px", "border-top-color": edge } : {},
        ),
      ],
    },
  };
}

const light = page("light", "rgb(255, 255, 255)", "rgb(255, 0, 0)");
const dark = page("dark", "rgb(0, 0, 0)");
const adaptive = compileLayout(light, { name: "CardView", dark });
const tokens = adaptive.files["CardView+Tokens.swift"]!;

test("a single-use colour that differs in dark becomes an adaptive token the view references", () => {
  const name =
    /static let (\w+) = Color\.markswift\(light: \.markswift\(1\.0, 1\.0, 1\.0\), dark: \.markswift\(0\.0, 0\.0, 0\.0\)\)/.exec(
      tokens,
    )?.[1];
  expect(name).toBeDefined();
  expect(adaptive.code).toContain(`Palette.${name}`);
  expect(adaptive.code).not.toContain("Color.markswift(1.0, 1.0, 1.0)");
  expect(tokens).toContain("// 2 tokens: 1 adaptive (light/dark pairs), 1 static.");
});

test("colours identical in both themes stay static: shared ones as a token, single-use ones inline", () => {
  expect(tokens).toMatch(/static let \w+ = Color\.markswift\(0\.0, 0\.502, 1\.0\)\n/);
  expect(adaptive.code).toContain("Color.markswift(0.2, 0.698, 0.302)");
});

test("a slot only one theme paints keeps its light value and is reported once", () => {
  expect(adaptive.code).toContain("Color.markswift(1.0, 0.0, 0.0)");
  expect(adaptive.warnings).toHaveLength(1);
  expect(adaptive.warnings[0]).toMatchObject({ source: "adaptive", level: "approximated", feature: "color-scheme" });
  expect(adaptive.warnings[0]!.message).toMatch(/^1 node\(s\) differ .*: edge$/);
});

test("adaptive output previews both schemes; single-theme output keeps one preview and no warnings", () => {
  expect(adaptive.code).toContain('#Preview("CardView — Light")');
  expect(adaptive.code).toContain('#Preview("CardView — Dark")');
  expect(adaptive.code).toContain(".preferredColorScheme(.dark)");
  const single = compileLayout(light, { name: "CardView" });
  expect(single.warnings).toEqual([]);
  expect(single.code.match(/#Preview/g)).toHaveLength(1);
  expect(single.files["CardView+Tokens.swift"]).toContain("tokens, all static.");
});

test("geometry that moves between themes is reported", () => {
  const moved = structuredClone(dark);
  moved.root.children[1]!.bounds.y += 1;
  expect(
    compileLayout(light, { dark: moved })
      .warnings.map((w) => w.message)
      .join("\n"),
  ).toContain("accent");
});

test("the dark layout must be the dark capture of the same screen", () => {
  expect(() => compileLayout(dark, { dark })).toThrow();
  expect(() => compileLayout(light, { dark: { ...dark, combo: { screen: "other", theme: "dark" } } })).toThrow();
});

test("one light colour that pairs with two dark colours on a node is reported, not silently kept", () => {
  const edge = { "border-top-style": "solid", "border-top-width": "2px", "border-top-color": "rgb(255, 255, 255)" };
  const doc = (theme: "light" | "dark", fill: string): LayoutDoc => ({
    ...page(theme, fill),
    root: {
      ...page(theme, fill).root,
      children: [box("card", 0, { "background-color": fill, ...edge }), box("other", 20, edge)],
    },
  });
  const result = compileLayout(doc("light", "rgb(255, 255, 255)"), { dark: doc("dark", "rgb(0, 0, 0)") });
  expect(result.warnings.every((w) => w.source === "adaptive" && w.feature === "color-scheme")).toBe(true);
  expect(result.warnings.map((w) => w.message).join("\n")).toMatch(
    /1 node\(s\) paint a colour that changes in dark .*: card$/,
  );
});
