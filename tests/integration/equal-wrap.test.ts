import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { SemNode, StackNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const html = `<main data-markswift-root class="page"><section id="tracks">${["Capture", "Convert", "Inspect", "Ship"].map(title =>
  `<article><b>${title}</b><p>Measured browser layout with useful details</p></article>`).join("")}</section></main>`;
const css = `body{margin:0}*{box-sizing:border-box}.page{width:100%;padding:18px;font:14px/20px system-ui}
#tracks{display:flex;flex-wrap:wrap;gap:12px}
article{width:calc((100% - 12px)/2);min-height:96px;border:1px solid #ccc;border-radius:10px;padding:12px;background:#def}
article b{display:block;font:700 16px/20px system-ui}article p{margin:8px 0 0;font:12px/18px system-ui}`;
function tracks(node: SemNode): StackNode {
  if (node.id === "#tracks" && node.kind === "stack") return node;
  for (const child of "children" in node ? node.children : []) {
    try { return tracks(child); } catch { /* search the next sibling */ }
  }
  throw new Error("Missing wrapping tracks");
}

browserTest("one app bundle keeps live equal tracks and content height while fidelity uses each capture width", async () => {
  const captures = [];
  for (const width of [390, 320]) {
    const result = await convertHtml(html, { name: "EqualTracks", css, viewport: { width, height: 600 } });
    captures.push(result);
    const node = tracks(inferScreen(result.layout, "EqualTracks").root);
    expect(node.wrap).toEqual({ columnGap: 12, rowGap: 12, columns: 2 });
    expect(node.height).toEqual({ kind: "hug" });
    expect(node.children.map(child => child.frame.w)).toEqual(Array(4).fill(width === 390 ? 171 : 136));
    for (const card of node.children) {
      expect(card.width.kind).toBe("fill");
      expect(card.height.kind).toBe("fill");
      expect(card.minHeight).toBe(96);
      expect(card.padding).toEqual([13, 13, 13, 13]);
    }
    const fidelity = compileLayout(result.layout, { name: "EqualTracks", mode: "fidelity" });
    expect(fidelity.code).toContain(`.frame(width: ${width === 390 ? "171.0" : "136.0"}, height:`);
    expect(fidelity.code).not.toContain("columns: 2");
  }
  const app = compileLayout(captures[0]!.layout, { name: "EqualTracks", mode: "app" });
  expect(app.code).toContain("columns: 2, stretch: true");
  expect(app.code).not.toContain(".frame(width: 171.0");
  expect(app.code).not.toContain(".frame(height: 204.0");
  expect(app.code).toContain("minHeight: 96.0, maxHeight: .infinity");
  expect(app.diagnostics.flatMap(item => item.notes).some(note => note.includes("cannot reflow") || note.includes("may not resize proportionally"))).toBe(false);
  expect(tracks(inferScreen(captures[1]!.layout, "EqualTracks").root).frame.h)
    .toBeGreaterThan(tracks(inferScreen(captures[0]!.layout, "EqualTracks").root).frame.h);
}, 30_000);

browserTest("a browser-resolved minimum width stays a diagnosed captured layout", async () => {
  const result = await convertHtml(html, { name: "ConstrainedTracks", css: css + "article{min-width:165px}", viewport: { width: 390, height: 600 } });
  const node = tracks(inferScreen(result.layout, "ConstrainedTracks").root);
  expect(node.wrap).toBeUndefined();
  expect(node.measured).toBeDefined();
  expect(result.diagnostics.find(item => item.id === "#tracks")?.notes.some(note => note.includes("cannot reflow"))).toBe(true);
}, 30_000);
