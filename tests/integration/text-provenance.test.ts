import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { compileLayout, compileLayouts } from "../../src/compiler/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { readChromeTextLedger } from "../../tools/verify/text-ledger-chrome.ts";
import { compareTextSourceCapture } from "../../tools/verify/text-projection.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeBrowserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" && process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
const css = "html,body{margin:0;background:white}#root{width:100%;height:420px;box-sizing:border-box;padding:16px;font:16px/24px system-ui;color:black}button,a{font:inherit;color:inherit;text-align:start;appearance:none;padding:8px;border:1px solid #888}p{margin:10px 0}";

function stripClaims(node: LayoutNode) {
  delete node.textSource; delete node.textSourceCapture;
  node.children.forEach(stripClaims);
}

browserTest("source join uses the same settled live phase as the independent ledger and preserves default Swift", async () => {
  const browser = new BrowserCapture({ viewport: { width: 390, height: 600 }, dpr: 2 });
  await browser.start();
  try {
    let ledger: Awaited<ReturnType<typeof readChromeTextLedger>> | undefined;
    const capture = await browser.capture({ key: "source", screen: "source", theme: "light", url: "http://markswift.local/source", root: "#root",
      html: '<main id="root">Before<!--comment--><span id="same"> office</span><span id="same" style="display:contents"><b> words</b></span> \n<br>After</main>',
      prepare: async page => { await page.addStyleTag({ content: css }); },
      observeSnapshot: async page => { ledger = await readChromeTextLedger(page, "#root"); },
    }, htmlIdentity, "source.html");
    expect(ledger).toBeDefined();
    expect(capture.layout.root.textSourceCapture?.occurrences.every(entry => entry.join === "verified")).toBe(true);
    const comparison = compareTextSourceCapture(ledger!, capture.layout.root.textSourceCapture!);
    expect(comparison.failures).toEqual([]);
    const sourceKeys = capture.layout.root.textSourceCapture!.occurrences.map(entry => entry.key);
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
    expect(sourceKeys).toContain("dom:/2/0");
    expect(capture.layout.root.textSourceCapture?.occurrences.some(entry => entry.ancestors.some(ancestor => ancestor.display === "contents"))).toBe(true);
    const legacy = structuredClone(capture.layout); stripClaims(legacy.root);
    for (const mode of ["app", "fidelity"] as const) {
      const plain = compileLayout(capture.layout, { name: "SourceCaption", mode });
      expect(plain.files).toEqual(compileLayout(legacy, { name: "SourceCaption", mode }).files);
      const observed = compileLayout(capture.layout, { name: "SourceCaption", mode, textInstrumentation: true });
      expect(observed.text?.emissions.length).toBeGreaterThan(0);
      expect(observed.files["MarkswiftRuntime.swift"]).toBe(plain.files["MarkswiftRuntime.swift"]);
      expect(observed.diagnostics).toEqual(plain.diagnostics);
    }
  } finally { await browser.stop(); }
}, 30000);

nativeBrowserTest("full app/fidelity source-observed captions and greedy paragraphs typecheck with Swift6 and older-runtime fallbacks", async () => {
  const browser = new BrowserCapture({ viewport: { width: 390, height: 600 }, dpr: 2 });
  const directory = await mkdtemp(join(tmpdir(), "markswift-text-observation-"));
  await browser.start();
  try {
    const htmls = [
      '<main id="root"><section style="display:flex;justify-content:space-between"><span>Status</span><a href="#details">Open link</a><button onclick="saveChanges()">Save changes</button></section></main>',
      '<main id="root"><p>Measure the available width before translating ordinary words into native components</p><a href="#details">Responsive Supercalifragilisticexpialidocious</a></main>',
      '<main id="root"><p>First<br>Second<br>First</p><p style="white-space:pre-wrap">A😀B\nAnother line</p><p>Same <span>word</span> word</p></main>',
      '<main id="root"><table><thead><tr><th>Word</th><th>Status</th></tr></thead><tbody><tr><td>Repeated word</td><td>Ready</td></tr></tbody></table></main>',
    ];
    const inputs = [];
    for (const [index, html] of htmls.entries()) {
      const captured = await browser.capture({ key: `scope${index}`, screen: "scope", theme: "light", url: `http://markswift.local/scope${index}`, html, root: "#root",
        prepare: async page => { await page.addStyleTag({ content: css }); },
      }, htmlIdentity, "scope.html");
      for (const mode of ["app", "fidelity"] as const) inputs.push({ name: `Scope${index}${mode}`, layout: captured.layout, mode, textInstrumentation: true, geometryInstrumentation: true });
    }
    const compiled = compileLayouts(inputs);
    expect(Object.values(compiled.files).join("\n")).toContain("MarkswiftObservedGreedyText(");
    expect(compiled.views.some(view => view.text?.emissions.some(emission => emission.kind === "flow-separator" && emission.unavailable.includes("actual Flow-gap geometry unavailable")))).toBe(true);
    for (const [name, code] of Object.entries(compiled.files)) await Bun.write(join(directory, name), code);
    const sdk = await typecheck(directory); expect(sdk.ok, sdk.output).toBe(true);
    expect(sdk.output).toBe("");
    const older = await typecheck(directory, { ios: "17.0", swiftVersion: "6", strictConcurrency: true, defaultIsolationMainActor: false });
    expect(older.ok, older.output).toBe(true); expect(older.output).toBe("");
  } finally { await browser.stop(); await rm(directory, { recursive: true, force: true }); }
}, 60000);
