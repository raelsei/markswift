import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml, compileLayouts } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { walk, type SemNode } from "../../src/model/semantic.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
browserTest("actual Chrome fieldset captions retain native anchor contracts only for admitted decoration", async () => {
  const variants = [
    { id: "ordinary", caption: '<legend id="chosen">Ordinary</legend>', css: "", admitted: true },
    { id: "hidden-first", caption: '<legend style="display:none">Hidden</legend><legend id="chosen">Visible second</legend>', css: "", admitted: true },
    { id: "relative", caption: '<legend id="chosen">Relative</legend>', css: "legend{position:relative;left:7px;top:4px}", admitted: true },
    { id: "center", caption: '<legend id="chosen">Centered</legend>', css: "legend{margin-inline:auto}", admitted: true },
    { id: "hidden-paint", caption: '<legend id="chosen">Blank paint</legend>', css: "legend{visibility:hidden}", admitted: true },
    { id: "float", caption: '<legend id="chosen">Float</legend>', css: "legend{float:left}", admitted: false, reason: "floated/absolute" },
    { id: "absolute", caption: '<legend id="chosen">Absolute</legend>', css: "fieldset{position:relative}legend{position:absolute}", admitted: false, reason: "floated/absolute" },
    { id: "vertical", caption: '<legend id="chosen">Vertical</legend>', css: "fieldset{writing-mode:vertical-rl}", admitted: false, reason: "vertical" },
    { id: "complex", caption: '<legend id="chosen">Gradient</legend>', css: "fieldset{background-image:linear-gradient(30deg,#234,#789)}", admitted: false, reason: "complex fieldset fill" },
  ];
  const inputs = [];
  for (const variant of variants) {
    let browser: { legend: { x: number; y: number; w: number; h: number }; hiddenLegendCount: number } | undefined;
    const result = await convertHtml(`<main id="sample" data-markswift-root><fieldset id="panel">${variant.caption}<p>Ordinary measured content.</p></fieldset></main>`, {
      name: `Fieldset${variant.id.replaceAll("-", "")}`, mode: "app", theme: "light", viewport: { width: 390, height: 380 },
      css: `html,body{margin:0}*{box-sizing:border-box}main{width:300px;padding:16px;font:14px/20px system-ui}fieldset{width:260px;margin:0;padding:12px;border:2px solid #375c86;border-radius:8px;background:rgba(20,40,60,.4)}legend{padding:0 6px}p{margin:12px 0}${variant.css}`,
      async prepare(page) {
        browser = await page.evaluate(() => {
          const legend = document.querySelector("#chosen")!, rect = legend.getBoundingClientRect();
          return { legend: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, hiddenLegendCount: [...document.querySelectorAll("legend")].filter(node => getComputedStyle(node).display === "none").length };
        });
      },
    });
    let panel: SemNode | undefined, legend: SemNode | undefined;
    walk(inferScreen(result.layout, "Fieldset").root, node => { if (node.id === "#panel") panel = node; if (node.id === "#chosen") legend = node; });
    expect(browser?.legend.h).toBeGreaterThan(0);
    if (variant.admitted) {
      expect(panel?.fieldsetPaint?.legendId).toBe("#chosen");
      expect(legend?.fieldsetLegend?.key).toBe(panel?.fieldsetPaint?.key);
      expect(result.code).toContain(".modifier(MarkswiftFieldsetBorder(");
      if (variant.id === "relative") expect(legend?.fieldsetLegend?.relativeOffset).toEqual([7, 4]);
      if (variant.id === "hidden-first") expect(browser?.hiddenLegendCount).toBe(1);
    } else {
      expect(panel?.fieldsetPaint).toBeUndefined();
      expect(panel?.notes.join(" ")).toContain(variant.reason!);
    }
    for (const mode of ["app", "fidelity"] as const) inputs.push({ name: `LiveFieldset${variant.id.replaceAll("-", "")}${mode}`, mode, layout: result.layout });
  }
  if (process.env.MARKSWIFT_SWIFT_TESTS === "1") {
    const directory = await mkdtemp(join(tmpdir(), "markswift-live-fieldset-sdk-"));
    try {
      const batch = compileLayouts(inputs);
      for (const [name, contents] of Object.entries(batch.files)) await writeFile(join(directory, name), contents);
      const result = await typecheck(directory);
      expect(result.ok, result.output).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}, 60000);
