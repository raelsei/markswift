import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml, compileLayouts } from "../../src/index.ts";
import { LayoutDoc, type LayoutNode } from "../../src/model/layout.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type SemNode } from "../../src/model/semantic.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
function find(root: LayoutNode, id: string): LayoutNode | undefined { return root.attrs.id === id ? root : root.children.map(node => find(node, id)).find(Boolean); }

browserTest("live Typed OM auto sides plus used geometry align independent hug/fixed siblings and a legend", async () => {
  const inputs = [];
  for (const width of [320, 390]) {
    let live: Record<string, { x: number; w: number; left: string; right: string }> | undefined;
    const result = await convertHtml(`<!doctype html><main id="sample" data-markswift-root>
      <div id="hug">Hugging caption</div><div id="fixed">Fixed box</div><div id="end">End box</div><div id="start">Start box</div>
      <div id="vertical">Vertical auto</div><div id="opposite">Fixed opposite</div>
      <fieldset id="panel"><legend id="caption">Centered legend</legend><p>Measured body</p></fieldset></main>`, {
      name: `Margins${width}`, mode: "app", viewport: { width, height: 500 }, theme: "light",
      css: `html,body{margin:0}*{box-sizing:border-box}main{padding:16px;width:100%;font:14px/20px system-ui}main>div{padding:4px;background:#e0e8f0;margin-bottom:8px}
        #hug{width:max-content;margin-inline:auto}#fixed,#end,#start,#vertical,#opposite{width:100px}#fixed{margin-inline:auto}#end{margin-left:auto;margin-right:0}#start{margin-left:0;margin-right:auto}#vertical{margin-block:auto}#opposite{margin-left:auto;margin-right:9px}
        fieldset{margin:0;width:100%;padding:12px;border:2px solid #375c86;min-width:0}legend{padding:0 6px;margin-inline:auto}p{margin:12px 0}`,
      async prepare(page) { live = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("main>div,legend")].map(node => {
        const rect = node.getBoundingClientRect(), map = (node as HTMLElement).computedStyleMap();
        return [node.id, { x: rect.x, w: rect.width, left: map.get("margin-left")!.toString(), right: map.get("margin-right")!.toString() }];
      }))); },
    });
    const layout = LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout))), nodes = new Map<string, SemNode>(); walk(inferScreen(layout, "Margins").root, node => nodes.set(node.id, node));
    for (const id of ["hug", "fixed", "caption"]) {
      expect(find(layout.root, id)?.preferredSize?.horizontalAutoMargins).toEqual([true, true]);
      expect(live?.[id]).toMatchObject({ left: "auto", right: "auto" });
      expect(nodes.get(`#${id}`)?.selfAlign).toBe("center");
    }
    expect(nodes.get("#hug")?.width.kind).toBe("hug"); expect(nodes.get("#fixed")?.width.kind).toBe("fixed");
    expect(find(layout.root, "end")?.preferredSize?.horizontalAutoMargins).toEqual([true, false]); expect(nodes.get("#end")?.selfAlign).toBe("end");
    expect(find(layout.root, "start")?.preferredSize?.horizontalAutoMargins).toEqual([false, true]); expect(nodes.get("#start")?.selfAlign).toBeUndefined();
    expect(find(layout.root, "vertical")?.preferredSize?.hasAutoMargins).toBe(true); expect(find(layout.root, "vertical")?.preferredSize?.horizontalAutoMargins).toEqual([false, false]); expect(nodes.get("#vertical")?.selfAlign).toBeUndefined();
    expect(nodes.get("#opposite")?.selfAlign).toBeUndefined(); expect(nodes.get("#opposite")?.notes.join(" ")).toContain("nonzero opposite margin");
    for (const id of ["hug", "fixed"]) expect(Math.abs(live![id]!.x - (width - live![id]!.w) / 2)).toBeLessThan(0.5);
    expect(Math.abs(live!.end!.x + live!.end!.w - (width - 16))).toBeLessThan(0.5);
    for (const mode of ["app", "fidelity"] as const) inputs.push({ name: `AutoMargins${width}${mode}`, mode, layout });
    const legacy = structuredClone(layout); const caption = find(legacy.root, "caption")!; delete caption.preferredSize!.horizontalAutoMargins;
    const legacyNodes = new Map<string, SemNode>(); walk(inferScreen(legacy, "Legacy").root, node => legacyNodes.set(node.id, node)); expect(legacyNodes.get("#caption")?.selfAlign).toBeUndefined();
    for (const mode of ["app", "fidelity"] as const) expect(compileLayouts([{ name: `Paint${mode}`, mode, layout }]).views[0]!.code).toContain(".frame(maxWidth: .infinity, alignment: .center)");
  }
  if (process.env.MARKSWIFT_SWIFT_TESTS === "1") {
    const directory = await mkdtemp(join(tmpdir(), "markswift-auto-margins-sdk-"));
    try { const batch = compileLayouts(inputs); for (const [name, code] of Object.entries(batch.files)) await writeFile(join(directory, name), code); const checked = await typecheck(directory); expect(checked.ok, checked.output).toBe(true); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
}, 60000);
