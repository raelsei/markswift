import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { visit } from "../../src/swift/traversal.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import type { SemNode } from "../../src/model/semantic.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const HTML = '<main data-markswift-root id="sizing-root">' + [
  '<section id="limits-parent"><div id="content-percent" class="limit content percent"></div><div id="border-percent" class="limit border percent"></div><div id="content-calc" class="limit content calc"></div><div id="border-calc" class="limit border calc"></div></section>',
  '<div id="min-text" class="group">Floor</div><div id="max-text" class="group">Clipped</div>',
  '<div id="overflow-parent" class="percent-parent group"><div id="percent-overflow" style="width:100%;height:100%"></div></div>',
  '<div id="fill-parent" class="percent-parent group"><div id="percent-fill" style="width:100%;height:100%"></div></div>',
  '<div id="basis-row" class="row group"><div id="basis-a"></div><div id="basis-b"></div></div>',
  '<div id="grow-column" class="column group"><div id="column-a"></div><div id="column-b"></div></div>',
  '<div id="partial-row" class="row group"><div id="partial-a"></div><div id="partial-b"></div></div>',
  '<div id="equal-row" class="row group"><div id="equal-a"></div><div id="equal-b"></div></div>',
  '<div id="equal-column" class="column group"><div id="equal-column-a"></div><div id="equal-column-b"></div></div>',
  '<div id="source-inline" class="size-source group" style="width:120px;height:40px"><div class="source-child"></div></div>',
  '<div id="source-sheet" class="size-source sheet-size group"><div class="source-child"></div></div>',
  '<div id="source-utility" class="size-source w-30 h-10 group"><div class="source-child"></div></div>',
  '<div id="cascade-auto" class="size-source group" style="width:120px;height:40px"><div class="source-child"></div></div>',
].join("") + "</main>";
const CSS = `
  html,body{margin:0;font:16px/20px system-ui}
  #sizing-root{box-sizing:border-box;width:100%;padding:16px;border:2px solid #ddd;background:rgb(248,249,251);color:rgb(20,20,28)}
  @media(prefers-color-scheme:dark){#sizing-root{background:rgb(24,24,30);color:rgb(240,240,245)}}
  .group{margin-top:12px}
  #limits-parent{box-sizing:border-box;width:100%;padding:12px;border:3px solid #bbb}
  .limit{padding:10px;border:4px solid #333;height:40px;background:rgb(220,80,60)}
  .content{box-sizing:content-box}.border{box-sizing:border-box}
  .percent{max-width:50%}.calc{max-width:calc(50% - 10px)}
  #min-text{min-height:30px}#max-text{max-height:10px;overflow:hidden}
  .percent-parent{box-sizing:border-box;width:100%;height:80px;padding:8px;border:2px solid #888}
  #percent-overflow,#percent-fill{padding:10px;border:2px solid #222;background:rgb(60,120,220)}
  #percent-overflow{box-sizing:content-box}#percent-fill{box-sizing:border-box}
  .row{display:flex;height:36px}.column{display:flex;flex-direction:column;height:120px}
  .row>div,.column>div{background:rgb(220,80,60)}
  .row>div+div,.column>div+div{background:rgb(60,120,220)}
  #basis-a{flex:1 1 100px}#basis-b{flex:1 1 0px}
  #column-a{flex:1 1 0px}#column-b{flex:2 1 0px}
  #partial-a,#partial-b{flex:0.25 1 0px}#equal-a,#equal-b{flex:1 1 0px}
  #equal-column-a,#equal-column-b{flex:1 1 0px}
  .size-source{background:rgb(60,120,220)}.source-child{width:100%;height:100%}
  .sheet-size{width:120px;height:40px}.w-30{width:120px}.h-10{height:40px}
  #cascade-auto{width:auto!important;height:auto!important}#cascade-auto>.source-child{height:20px}
`;

/** Read the actual containing content box from Chrome, independently of semantic normalization. */
function contentSize(node: LayoutNode): { w: number; h: number } {
  const inset = (edge: string) => parseFloat(node.styles[`padding-${edge}`] ?? "0") + parseFloat(node.styles[`border-${edge}-width`] ?? "0");
  return { w: node.bounds.w - inset("left") - inset("right"), h: node.bounds.h - inset("top") - inset("bottom") };
}

function capturedNodes(root: LayoutNode, result = new Map<string, LayoutNode>()): Map<string, LayoutNode> {
  if (root.attrs.id) result.set(root.attrs.id, root);
  for (const child of root.children) capturedNodes(child, result);
  return result;
}

for (const width of [320, 390, 768]) {
  for (const theme of ["light", "dark"] as const) {
    browserTest(`sizing constraints and flex allocation remain correct at ${width}px in ${theme} theme`, async () => {
      const result = await convertHtml(HTML, { name: "LayoutSizing", css: CSS, mode: "fidelity", theme, viewport: { width, height: 1200 } });
      expect(result.warnings).toEqual([]);
      expect(result.layout.size.w).toBe(width);
      expect(result.layout.combo.theme).toBe(theme);
      expect(result.layout.canvas).toBe(theme === "dark" ? "rgb(24, 24, 30)" : "rgb(248, 249, 251)");
      const captured = capturedNodes(result.layout.root);
      const semantic = new Map<string, SemNode>();
      visit(inferScreen(result.layout, "LayoutSizing").root, node => semantic.set(node.id, node));
      const node = (id: string) => {
        const value = semantic.get(`#${id}`);
        if (!value) throw new Error(`Missing semantic node #${id}`);
        return value;
      };
      const measured = (id: string) => {
        const value = captured.get(id);
        if (!value) throw new Error(`Missing captured node #${id}`);
        return value;
      };
      const approximation = (id: string, reason: string) => {
        const diagnostic = result.diagnostics.find(item => item.id === `#${id}`);
        expect(diagnostic).toBeDefined();
        expect(diagnostic!.confidence).toBe("approximated");
        expect(diagnostic!.notes.some(note => note.startsWith("approximated:") && note.includes(reason))).toBe(true);
      };

      const limitsContent = contentSize(measured("limits-parent"));
      expect(limitsContent.w).toBe(width - 66);
      for (const [id, contentBox, offset] of [
        ["content-percent", true, 0], ["border-percent", false, 0],
        ["content-calc", true, 10], ["border-calc", false, 10],
      ] as const) {
        const own = measured(id), ownContent = contentSize(own);
        const horizontalInsets = own.bounds.w - ownContent.w;
        expect(horizontalInsets).toBe(28);
        const expected = limitsContent.w * 0.5 - offset + (contentBox ? horizontalInsets : 0);
        expect(own.bounds.w).toBeCloseTo(expected, 2);
        expect(node(id).maxWidth).toBeCloseTo(expected, 2);
        expect(node(id).width).toEqual({ kind: "fixed", px: expected });
        expect(result.diagnostics.find(item => item.id === `#${id}`)).toBeUndefined();
      }

      expect(measured("min-text").bounds.h).toBe(30);
      expect(node("min-text").minHeight).toBe(30);
      expect(measured("max-text").bounds.h).toBe(10);
      expect(node("max-text").maxHeight).toBe(10);
      expect(node("max-text").style.clip).toBe(true);
      expect(result.code).toContain("minHeight: 30.0");
      expect(result.code).toContain("maxHeight: 10.0");

      const overflowParent = contentSize(measured("overflow-parent"));
      const overflow = measured("percent-overflow");
      expect(overflow.bounds.w).toBe(overflowParent.w + 24);
      expect(overflow.bounds.h).toBe(overflowParent.h + 24);
      expect(node("percent-overflow").width).toEqual({ kind: "fixed", px: overflow.bounds.w });
      expect(node("percent-overflow").height).toEqual({ kind: "fixed", px: overflow.bounds.h });
      const fillParent = contentSize(measured("fill-parent"));
      expect(measured("percent-fill").bounds.w).toBe(fillParent.w);
      expect(measured("percent-fill").bounds.h).toBe(fillParent.h);
      expect(node("percent-fill").width).toEqual({ kind: "fill" });
      expect(node("percent-fill").height).toEqual({ kind: "fill" });

      const rowWidth = contentSize(measured("basis-row")).w;
      for (const [id, expected] of [["basis-a", (rowWidth + 100) / 2], ["basis-b", (rowWidth - 100) / 2]] as const) {
        expect(measured(id).bounds.w).toBe(expected);
        expect(node(id).width).toEqual({ kind: "fixed", px: expected });
        approximation(id, "unequal measured widths");
        approximation(id, "basis");
      }
      for (const [id, expected] of [["column-a", 40], ["column-b", 80]] as const) {
        expect(measured(id).bounds.h).toBe(expected);
        expect(node(id).height).toEqual({ kind: "fixed", px: expected });
        approximation(id, "unequal flex-grow factors [1,2]");
        approximation(id, "height pinned");
      }
      for (const id of ["partial-a", "partial-b"]) {
        const expected = contentSize(measured("partial-row")).w * 0.25;
        expect(measured(id).bounds.w).toBe(expected);
        expect(node(id).width).toEqual({ kind: "fixed", px: expected });
        approximation(id, "flex-grow total 0.5 < 1");
      }
      for (const id of ["equal-a", "equal-b"]) {
        expect(measured(id).bounds.w).toBe(rowWidth / 2);
        expect(node(id).width).toEqual({ kind: "fill" });
        expect(result.diagnostics.find(item => item.id === `#${id}`)).toBeUndefined();
      }
      // A stylesheet's definite height establishes the proposal for equal native fill children.
      expect(measured("equal-column").preferredSize).toEqual({ width: "auto", height: "120px" });
      expect(node("equal-column").height).toEqual({ kind: "fixed", px: 120 });
      for (const id of ["equal-column-a", "equal-column-b"]) {
        expect(measured(id).bounds.h).toBe(60);
        expect(measured(id).preferredSize).toEqual({ width: "auto", height: "auto" });
        expect(node(id).height).toEqual({ kind: "fill" });
        expect(result.diagnostics.find(item => item.id === `#${id}`)).toBeUndefined();
      }

      // Source syntax and selector naming must not alter browser-resolved size intent.
      for (const id of ["source-inline", "source-sheet", "source-utility"]) {
        expect(measured(id).preferredSize).toEqual({ width: "120px", height: "40px" });
        expect(measured(id).bounds.w).toBe(120);
        expect(measured(id).bounds.h).toBe(40);
        expect(node(id).width).toEqual({ kind: "fixed", px: 120 });
        expect(node(id).height).toEqual({ kind: "fixed", px: 40 });
        expect(result.diagnostics.find(item => item.id === `#${id}`)).toBeUndefined();
      }

      // Winning auto declarations must replace stale inline px dimensions, even though the
      // original style attribute remains in the capture for debugging/legacy consumers.
      expect(measured("cascade-auto").attrs.style).toContain("width:120px;height:40px");
      expect(measured("cascade-auto").preferredSize).toEqual({ width: "auto", height: "auto" });
      expect(measured("cascade-auto").bounds.w).toBe(contentSize(measured("sizing-root")).w);
      expect(measured("cascade-auto").bounds.h).toBe(20);
      expect(node("cascade-auto").width).toEqual({ kind: "fill" });
      expect(node("cascade-auto").height).toEqual({ kind: "hug" });
      expect(result.diagnostics.some(item => item.confidence === "unmapped")).toBe(false);
    }, 30000);
  }
}
