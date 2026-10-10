import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { compileLayout, type LayoutDoc } from "../../src/compiler/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import attribute from "./inventory/attribute.ts";
import cssLayout from "./inventory/css-layout.ts";
import cssMisc from "./inventory/css-misc.ts";
import cssPaint from "./inventory/css-paint.ts";
import cssTypography from "./inventory/css-typography.ts";
import html from "./inventory/html.ts";
import svg from "./inventory/svg.ts";

const ROWS = new Set([attribute, cssLayout, cssMisc, cssPaint, cssTypography, html, svg].flatMap((inv) => inv.entries.map((e) => e.id)));
const doc = (child: LayoutNode): LayoutDoc => ({ version: 2, source: "diagnostics", combo: { screen: "d", theme: "light" }, size: { w: 200, h: 200 }, dpr: 1, canvas: "rgb(255, 255, 255)", fonts: [],
  root: { id: "root", tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 200, h: 200 }, children: [child] } });
const box = (styles: Record<string, string>, extra: Partial<LayoutNode> = {}): LayoutNode => ({ id: "probe", tag: "div", attrs: {}, styles: { display: "block", ...styles }, bounds: { x: 0, y: 0, w: 100, h: 100 }, children: [], ...extra });
const el = (tag: string, attrs: Record<string, string> = {}, children: LayoutNode[] = [], styles: Record<string, string> = {}): LayoutNode => ({ tag, attrs, styles, bounds: { x: 0, y: 0, w: 20, h: 20 }, children });
const text = (s: string): LayoutNode => ({ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 60, h: 20 }, text: s, children: [] });
const paragraph = (styles: Record<string, string>) => box({ "font-size": "16px", "line-height": "20px", ...styles }, { tag: "p", bounds: { x: 0, y: 0, w: 100, h: 20 }, children: [text("Hello world")] });
const svgOf = (...children: LayoutNode[]) => box({}, { tag: "svg", attrs: { viewbox: "0 0 100 100" }, children });
const rect = (attrs: Record<string, string>) => el("rect", { x: "0", y: "0", width: "10", height: "10", ...attrs });
const inlineBlock = (x: number, y: number): LayoutNode => ({ ...el("div", {}, [], { display: "inline-block" }), bounds: { x, y, w: 40, h: 20 } });
const IMG = box({}, { tag: "img", attrs: { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>' } });

/** One row per feature the product does not reproduce: the input that loses it, and the diagnostic it must produce. */
const CASES: Array<{ feature: string; level: "approximated" | "unmapped"; node: LayoutNode }> = [
  { feature: "animation-name", level: "unmapped", node: box({ "animation-name": "spin" }) },
  { feature: "writing-mode", level: "unmapped", node: paragraph({ "writing-mode": "vertical-rl" }) },
  { feature: "filter", level: "unmapped", node: box({ filter: "url(#f)" }) },
  { feature: "mix-blend-mode", level: "unmapped", node: box({ "mix-blend-mode": "plus-darker-bogus" }) },
  { feature: "clip-path", level: "unmapped", node: box({ "clip-path": "url(#c)" }) },
  { feature: "transform", level: "unmapped", node: box({ transform: "bogus(1)" }) },
  { feature: "mask-image", level: "unmapped", node: box({ "mask-image": "image-set(url(a.png) 1x)" }) },
  { feature: "background-image", level: "unmapped", node: box({ "background-image": "image-set(url(a.png) 1x)" }) },
  { feature: "background-image", level: "approximated", node: box({ "background-image": "linear-gradient(rgb(255, 0, 0), 50%, rgb(0, 0, 255))" }) },
  { feature: "box-shadow", level: "unmapped", node: box({ "box-shadow": "garbage 1px" }) },
  { feature: "font-family", level: "approximated", node: paragraph({ "font-family": "Arial, sans-serif" }) },
  { feature: "display: inline-block", level: "approximated", node: box({}, { children: [inlineBlock(0, 0), inlineBlock(50, 0), inlineBlock(0, 30), inlineBlock(50, 30)] }) },
  { feature: "canvas", level: "unmapped", node: { ...box({}), tag: "canvas" } },
  { feature: "svg:textPath", level: "unmapped", node: svgOf(el("text", { x: "0", y: "10" }, [el("textpath", { href: "#p" }, [text("around")])])) },
  { feature: "svg:image", level: "unmapped", node: svgOf(el("image", { href: "a.png" })) },
  { feature: "svg:use", level: "unmapped", node: svgOf(el("use", { href: "#missing" })) },
  { feature: "svg:clipPath", level: "unmapped", node: svgOf(el("g", { id: "clipg" }), rect({ "clip-path": "url(#clipg)" })) },
  { feature: "svg:mask", level: "unmapped", node: svgOf(el("g", { id: "maskg" }), rect({ mask: "url(#maskg)" })) },
  { feature: "svg:stop", level: "unmapped", node: svgOf(el("lineargradient", { id: "lg" }), rect({ fill: "url(#lg)" })) },
  { feature: "fill", level: "unmapped", node: svgOf(el("g", { id: "notpaint" }), rect({ fill: "url(#notpaint)" })) },
  { feature: "svg", level: "unmapped", node: svgOf(rect({ "clip-path": "url(#absent)" })) },
  { feature: "svg:filter", level: "unmapped", node: svgOf(el("g", { filter: "url(#f)" }, [rect({})])) },
  { feature: "svg:marker", level: "unmapped", node: svgOf(el("path", { d: "M0 0L10 10", "marker-end": "url(#m)" })) },
  { feature: "svg:foreignObject", level: "unmapped", node: svgOf(el("foreignobject", { width: "10", height: "10" })) },
  { feature: "text-shadow", level: "unmapped", node: paragraph({ "text-shadow": "garbage" }) },
  { feature: "background-clip", level: "unmapped", node: paragraph({ "background-clip": "text", "background-image": "none", "-webkit-text-fill-color": "rgba(0, 0, 0, 0)" }) },
  { feature: "style", level: "unmapped", node: box({}, { tag: "img", attrs: { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:red}</style><path class="a" d="M0 0H10V10Z"/></svg>' } }) },
  { feature: "img", level: "unmapped", node: IMG },
];

for (const c of CASES) {
  test(`${c.feature} reports a ${c.level} diagnostic`, () => {
    const found = compileLayout(doc(c.node)).diagnostics.flatMap((r) => r.diagnostics);
    expect(found).toContainEqual(expect.objectContaining({ level: c.level, feature: c.feature }));
    for (const d of found) expect(ROWS.has(d.feature)).toBe(true);
  });
}

test("an emit-time unmapped loss grades its node unmapped", () => {
  expect(compileLayout(doc(IMG)).diagnostics.find((r) => r.id === "probe")?.confidence).toBe("unmapped");
});

test("every literal feature in src names an inventory row, and every literal unmapped feature has a case above", async () => {
  // Matches `addDiagnostic(list, "unmapped", "svg:use"` / `note(n, "approximated", `float`` / text's `note("approximated", "a"`;
  // skips interpolated features. Anchored on the call so `family(tags, route, "approximated", "→ …")` is not a diagnostic.
  const re = /\b(?:addDiagnostic\([^,()]+,|note\((?:\s*n,)?)\s*"(approximated|unmapped)",\s*(["`])([^"`$]+)\2/g;
  const unmapped = new Set<string>();
  const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((e) => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []))).flat();
  for (const file of await walk(join(import.meta.dir, "../../src"))) {
    for (const [, level, , feature] of (await Bun.file(file).text()).matchAll(re)) {
      expect({ file, feature, known: ROWS.has(feature!) }).toEqual({ file, feature, known: true });
      if (level === "unmapped") unmapped.add(feature!);
    }
  }
  const covered = new Set(CASES.filter((c) => c.level === "unmapped").map((c) => c.feature));
  expect([...unmapped].filter((f) => !covered.has(f))).toEqual([]);
});
