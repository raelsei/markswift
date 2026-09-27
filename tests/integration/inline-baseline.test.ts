import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type StackNode } from "../../src/model/semantic.ts";
import { LayoutDoc } from "../../src/model/layout.ts";
import { readInlineStruts } from "../../src/browser/inline-strut.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { emitSwift } from "../../src/swift/emit.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1";
const html = `<main id="proof" data-markswift-root>
<label id="ordinary"><input type="checkbox"> Ordinary label</label>
<label id="zero"><input type="radio" style="margin:0"> No margins</label>
<label id="asymmetric"><input type="checkbox" style="margin:2px 1px 6px 4px"> Asymmetric margins</label>
<label id="larger" style="font:18px/28px system-ui"><input type="checkbox" style="width:16px;height:16px"> Larger label</label>
<label id="none"><input type="checkbox" style="appearance:none"> Authored appearance</label>
<label id="middle"><input type="checkbox" style="vertical-align:middle"> Middle alignment</label>
<label id="negative"><input type="checkbox" style="margin-top:-2px"> Negative margin</label>
<label id="percentage"><input type="checkbox" style="margin-top:1%"> Percentage margin</label>
<label id="relative"><input type="checkbox" style="position:relative;top:1px"> Relative paint</label>
<label id="transform"><input type="checkbox" style="transform:translateY(1px)"> Transformed paint</label>
<label id="features" style="font-feature-settings:'ss01'"><input type="checkbox"> Authored font settings</label>
<label id="fractional" style="line-height:20.5px"><input type="checkbox"> Fractional leading</label>
<div style="position:relative"><label id="ancestor-relative"><input type="checkbox"> Relative ancestor</label></div>
<label id="horizontal-percentage"><input type="checkbox" style="margin-left:2%"> Horizontal percentage</label>
<label id="tall"><input type="radio" style="width:22px;height:22px;margin:0"> Taller observed widget</label>
<label id="stretch" style="font-stretch:75%"><input type="checkbox"> Authored font width</label>
<label id="asymmetric-span"><input type="checkbox" style="margin:2px 1px 6px 4px"><span> Asymmetric span margins</span></label>
<label id="bordered" style="padding:5px 7px 9px 11px;border:solid #38495b;border-width:1px 2px 3px 4px"><input type="checkbox" style="margin:2px 1px 6px 4px"><span> Bordered span label</span></label>
<label id="direct-bordered" style="padding:5px 7px 9px 11px;border:solid #38495b;border-width:1px 2px 3px 4px"><input type="radio" style="margin:2px 1px 6px 4px"> Direct bordered label</label>
<label id="large-bordered" style="font:18px/28px system-ui;padding:5px 7px 9px 11px;border:solid #38495b;border-width:1px 2px 3px 4px"><input type="checkbox" style="width:16px;height:16px;margin:2px 1px 6px 4px"><span> Larger bordered span</span></label>
<label id="large-direct-bordered" style="font:18px/28px system-ui;padding:5px 7px 9px 11px;border:solid #38495b;border-width:1px 2px 3px 4px"><input type="radio" style="width:16px;height:16px;margin:2px 1px 6px 4px"> Larger direct bordered label</label>
<label id="bordered-none" style="padding:5px 7px 9px 11px;border:solid #38495b;border-width:1px 2px 3px 4px"><input type="checkbox" style="margin:2px 1px 6px 4px;appearance:none"><span> Unsupported bordered appearance</span></label>
<label id="parent-percentage" style="padding-top:2%"><input type="checkbox"><span> Relative parent padding</span></label>
</main>`;
const css = `html,body{margin:0}main{width:100%;padding:16px;box-sizing:border-box;font:14px/20px system-ui}label{display:block;padding:4px 0;margin-bottom:8px}input{width:13px;height:13px}`;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

browserTest("single inline widget rows preserve independently captured struts/margins and decline unproved contracts", async () => {
  for (const doctype of ["", "<!doctype html>"]) {
    const result = await convertHtml(doctype + html, { name: "InlineBaselines", css, root: "#proof", viewport: { width: 390, height: 780 }, async prepare(page) {
      const before = await page.locator("#proof").screenshot();
      const metrics = await readInlineStruts(page, "#proof");
      const after = await page.locator("#proof").screenshot();
      expect(hash(before)).toBe(hash(after));
      expect(metrics["0"]?.strut).toEqual({ ascent: 14, descent: 3, lineHeight: 20 });
      expect(metrics["0/0"]?.margins).toEqual([3, 3, 3, 4]);
      expect(metrics["2/0"]?.margins).toEqual([2, 1, 6, 4]);
      expect(metrics["6/0"]?.margins).toBeUndefined();
      expect(metrics["7/0"]?.margins).toBeUndefined();
    } });
    const decoded = LayoutDoc.parse(JSON.parse(JSON.stringify(result.layout)));
    const rows = new Map<string, StackNode>();
    walk(inferScreen(decoded, "InlineBaselines").root, node => { if (node.kind === "stack") rows.set(node.id, node); });
    for (const id of ["ordinary", "zero", "asymmetric", "larger", "asymmetric-span", "bordered", "direct-bordered"]) expect(rows.get("#" + id)?.inlineBaseline).toBeDefined();
    expect(rows.get("#ordinary")!.inlineBaseline!.strutAscent).toBe(15);
    expect(rows.get("#ordinary")!.inlineBaseline!.strutDescent).toBe(5);
    expect(rows.get("#asymmetric")!.inlineBaseline!.items[0]).toMatchObject({ kind: "widget", top: 2, bottom: 6 });
    expect(rows.get("#larger")!.inlineBaseline!.strutAscent).toBe(20);
    expect(rows.get("#asymmetric-span")!.inlineBaseline!.sourceInsets).toEqual([4, 0, 4, 0]);
    expect(rows.get("#asymmetric-span")!.padding).toEqual([4, 0, 7, 0]);
    expect(rows.get("#bordered")!.inlineBaseline!.sourceInsets).toEqual([6, 9, 12, 15]);
    expect(rows.get("#bordered")!.padding).toEqual([6, 9, 15, 15]);
    expect(rows.get("#direct-bordered")!.inlineBaseline!.sourceInsets).toEqual([6, 9, 12, 15]);
    for (const id of ["none", "middle", "negative", "percentage", "relative", "transform", "features", "fractional", "ancestor-relative", "horizontal-percentage", "tall", "stretch", "bordered-none", "parent-percentage"]) {
      expect(rows.get("#" + id)?.inlineBaseline).toBeUndefined();
      expect(rows.get("#" + id)?.notes.join(" ")).toContain("inline widget baseline unavailable");
    }
    expect(rows.get("#tall")?.notes.join(" ")).toContain("native widget dimensions have no bounded guide proof");
    expect(rows.get("#stretch")?.notes.join(" ")).toContain("unsupported font-stretch:75%");
    const legacy = JSON.parse(JSON.stringify(decoded));
    const clear = (node: any) => { delete node.inlineStrut; delete node.inlineControlMargins; node.children.forEach(clear); }; clear(legacy.root);
    walk(inferScreen(legacy, "Legacy").root, node => { if (node.kind === "stack" && node.id === "#ordinary") {
      expect(node.inlineBaseline).toBeUndefined(); expect(node.notes.join(" ")).toContain("CSS strut metrics missing");
    } });
  }
}, 60000);

browserTest("inline span admission uses actual CSS border/padding without changing fallback or fidelity insets", async () => {
  for (const doctype of ["", "<!doctype html>"]) for (const theme of ["light", "dark"] as const) {
    const captured = await convertHtml(doctype + html, { name: "InsetProof", css, theme, root: "#proof", viewport: { width: 390, height: 1000 }, async prepare(page) {
      const before = await page.locator("#proof").screenshot();
      const facts = await page.evaluate(() => ["asymmetric-span", "bordered", "direct-bordered"].map(id => {
        const row = document.getElementById(id)!, control = row.querySelector("input")!, style = getComputedStyle(row);
        const rect = () => ({ row: row.getBoundingClientRect().toJSON(), control: control.getBoundingClientRect().toJSON() });
        const original = rect(), marker = document.createElement("i");
        marker.style.cssText = "all:initial;display:inline-block;vertical-align:baseline;width:0;height:0;margin:0;padding:0;border:0";
        row.append(marker); const baseline = marker.getBoundingClientRect().y, probed = rect(); marker.remove();
        const edges = ["top", "right", "bottom", "left"].map(edge => parseFloat(style.getPropertyValue(`padding-${edge}`)) + parseFloat(style.getPropertyValue(`border-${edge}-width`)));
        return { id, passiveRectExact: JSON.stringify(original) === JSON.stringify(probed), insets: edges,
          contentHeight: original.row.height - edges[0]! - edges[2]!, baselineFromContentTop: baseline - original.row.y - edges[0]!, borderBottomMinusBaseline: original.control.bottom - baseline };
      }));
      expect(hash(before)).toBe(hash(await page.locator("#proof").screenshot()));
      for (const fact of facts) {
        expect(fact.passiveRectExact).toBe(true); expect(fact.contentHeight).toBe(21); expect(fact.baselineFromContentTop).toBe(15); expect(fact.borderBottomMinusBaseline).toBe(0);
        expect(fact.insets).toEqual(fact.id === "asymmetric-span" ? [4, 0, 4, 0] : [6, 9, 12, 15]);
      }
    } });
    const screen = inferScreen(captured.layout, "InsetProof"), rows = new Map<string, StackNode>();
    walk(screen.root, node => { if (node.kind === "stack") rows.set(node.id, node); });
    const app = emitSwift(screen, "InsetProof", { mode: "app", geometryInstrumentation: true, textInstrumentation: true });
    expect(app.view).toContain(".padding(EdgeInsets(top: 6.0, leading: 15.0, bottom: 12.0, trailing: 9.0))");
    expect(rows.get("#bordered")!.padding).toEqual([6, 9, 15, 15]);
    expect(rows.get("#bordered-none")!.inlineBaseline).toBeUndefined();
    expect(rows.get("#bordered-none")!.padding[2]).toBeGreaterThanOrEqual(12);
    expect(app.geometry!.nodes.find(node => node.sourceId === "#bordered")?.instrumented).toBe(true);
    expect(app.text!.nodes.some(node => node.semanticId === "#bordered#text")).toBe(true);
    const original = structuredClone(screen);
    const fidelity = emitSwift(screen, "InsetProof", { mode: "fidelity", geometryInstrumentation: true, textInstrumentation: true });
    expect(screen).toEqual(original);
    const property = (view: string, id: string) => view.split(`// #${id}\n`)[1]!.split("\n    // ")[0]!;
    for (const id of ["asymmetric-span", "bordered", "direct-bordered", "large-bordered", "large-direct-bordered"]) {
      const row = rows.get("#" + id)!;
      expect(row.inlineBaseline).toBeDefined();
      expect(property(fidelity.view, id)).toContain(`.frame(height: ${row.frame.h}.0, alignment: .topLeading)`);
      expect(fidelity.geometry!.nodes.find(node => node.sourceId === "#" + id)?.instrumented).toBe(true);
    }
    expect(property(fidelity.view, "bordered")).toContain("bottom: 15.0");
    expect(property(fidelity.view, "direct-bordered")).toContain("bottom: 12.0");
    expect(emitSwift(screen, "InsetProof", { mode: "app", geometryInstrumentation: true, textInstrumentation: true }).view).toBe(app.view);
    const legacy = structuredClone(screen);
    walk(legacy.root, node => { if (node.kind === "stack") delete node.inlineBaseline; });
    const before = emitSwift(legacy, "InsetProof", { mode: "fidelity", geometryInstrumentation: true, textInstrumentation: true });
    for (const id of ["none", "negative", "percentage", "tall", "stretch", "bordered-none", "parent-percentage"]) {
      expect(rows.get("#" + id)!.inlineBaseline).toBeUndefined();
      expect(property(fidelity.view, id)).toBe(property(before.view, id));
    }
    expect(property(before.view, "direct-bordered")).not.toContain(".frame(height: 39.0, alignment: .topLeading)");
  }
}, 60000);

browserTest("complete app/fidelity inline-baseline bundles compile with Swift6 strict concurrency", async () => {
  if (!nativeTest) return;
  const captured = await convertHtml("<!doctype html>" + html, { name: "Inline", css, root: "#proof", viewport: { width: 390, height: 780 } });
  for (const mode of ["app", "fidelity"] as const) {
    const compiled = compileLayout(captured.layout, { name: "Inline" + mode, mode, geometryInstrumentation: true, textInstrumentation: true });
    expect(compiled.code.includes("MarkswiftInlineBaselineRow(id:")).toBe(mode === "app");
    const directory = await mkdtemp(join(tmpdir(), "markswift-inline-baseline-"));
    try { for (const [name, text] of Object.entries(compiled.files)) if (name.endsWith(".swift")) await Bun.write(join(directory, name), text);
      const checked = await typecheck(directory); expect(checked.output).toBe(""); expect(checked.ok).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}, 60000);
