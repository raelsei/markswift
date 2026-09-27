import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMarkerLayouts, attachMarkerLayouts } from "../../src/browser/list-markers.ts";
import { snapshotToTree, findByAttr, toLayout, type DomSnapshot } from "../../src/browser/snapshot.ts";
import { STYLE_WHITELIST } from "../../src/model/layout.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { SemNode } from "../../src/model/semantic.ts";
import { convertHtml } from "../../src/index.ts";
import { TYPECHECK_TARGET, typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? browserTest : test.skip;
const html = `<main id="root" data-markswift-root><ul><li>Disc</li><li style="list-style-type:circle">Circle</li><li style="list-style-type:square">Square</li><li style="list-style-position:inside">Inside</li><li id="custom">Custom</li><li dir="rtl">RTL</li></ul><details open><summary>Open summary</summary><p>Captured body</p></details><details><summary>Closed summary</summary><p>Unavailable body</p></details><details open><summary style="list-style-type:disclosure-open">Authored triangle</summary><p>Body</p></details></main>`;
const css = `body{margin:0}main{padding:12px;font:14px/20px system-ui;background:white;color:#123}ul{padding-left:28.5px;margin:0}p{margin:11px 0 0}#custom::marker{content:"! "}`;
const walkLayout = (n: LayoutNode): LayoutNode[] => [n, ...n.children.flatMap(walkLayout)];
const walkSem = (n: SemNode): SemNode[] => [n, ...(n.kind === "stack" || n.kind === "grid" ? n.children.flatMap(walkSem) : n.kind === "control" ? [...(n.label ? walkSem(n.label) : []), ...n.content.flatMap(walkSem)] : []), ...n.overlays.flatMap(o => walkSem(o.node))];

browserTest("live default marker metrics join to original pseudo/text bounds with guarded UA disclosure provenance", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 500 } });
    await page.setContent(`<style>${css}</style>${html}`); await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page);
    const markers = await readMarkerLayouts(page, "#root", cdp);
    expect(markers["0/0"]?.symbol).toBe("disc");
    expect(markers["0/1"]?.symbol).toBe("circle");
    expect(markers["0/2"]?.symbol).toBe("square");
    expect(markers["0/4"]).toBeUndefined(); expect(markers["0/5"]).toBeUndefined();
    expect(markers["1/0"]?.disclosureControl).toBe(true);
    expect(markers["2/0"]?.symbol).toBe("disclosure-closed");
    expect(markers["2/0"]?.disclosureControl).toBe(true);
    expect(markers["3/0"]?.disclosureControl).toBeUndefined();
    const snapshot = await cdp.send("DOMSnapshot.captureSnapshot", { computedStyles: [...STYLE_WHITELIST], includeDOMRects: true }) as unknown as DomSnapshot;
    const raw = findByAttr(snapshotToTree(snapshot), "id", "root")!; attachMarkerLayouts(raw, markers);
    const origin = await page.locator("#root").boundingBox();
    const root = toLayout(raw, origin!, (_, attrs, path) => attrs.id ?? path)!;
    const symbols = walkLayout(root).filter(n => n.markerLayout);
    expect(symbols).toHaveLength(7);
    const screen = inferScreen({ version: 1, source: "probe", combo: { screen: "markers", theme: "light", demoState: "normal" }, dpr: 1, size: { w: 390, h: 500 }, canvas: "white", root }, "markers");
    const sem = walkSem(screen.root);
    expect(sem.filter(n => n.kind === "svg")).toHaveLength(7);
    expect(sem.filter(n => n.kind === "svg" && n.disclosureSymbol)).toHaveLength(2);
    const inside = sem.find(n => n.id === "0/3")!;
    expect(inside.padding[0]).toBe(1); expect(inside.padding[2]).toBe(2);
    const details = sem.filter(n => n.kind === "control" && n.control === "disclosure");
    expect(details[0]!.kind === "control" && details[0]!.disclosureLayout).toEqual({ gap: 11, labelInset: 0, contentInset: 0, contentAvailable: true });
    expect(details[1]!.kind === "control" && details[1]!.disclosureLayout).toEqual({ gap: 0, labelInset: 0, contentInset: 0, contentAvailable: false });
    expect(details[1]!.notes.join("\n")).toContain("no captured layout");
    expect(details[2]!.notes.join("\n")).toContain("captured marker remains static");
    const summary = details[0]!.kind === "control" && details[0]!.label;
    expect(summary && summary.padding).toEqual([1, 0, 2, 0]);
    await cdp.detach();
  } finally { await browser.close(); }
}, 30000);

browserTest("author inherit/revert/shorthand, marker images and unsupported directions cannot acquire dynamic UA state", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>#revert>summary{list-style-type:revert}#image>summary::marker{content:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'/%3E")}</style><main id="root"><details open id="revert"><summary>Revert</summary></details><details open><summary style="list-style:disclosure-open inside">Shorthand</summary></details><details open style="list-style-type:disc"><summary>Inherited author override</summary></details><details open id="image"><summary>Image</summary></details><details open dir="rtl"><summary>Direction</summary></details></main>`);
    const cdp = await page.context().newCDPSession(page);
    const markers = await readMarkerLayouts(page, "#root", cdp);
    expect(markers["0/0"]?.disclosureControl).toBeUndefined();
    expect(markers["1/0"]?.disclosureControl).toBeUndefined();
    expect(markers["2/0"]?.disclosureControl).toBeUndefined();
    expect(markers["3/0"]).toBeUndefined(); expect(markers["4/0"]).toBeUndefined();
    await cdp.detach();
  } finally { await browser.close(); }
}, 30000);

nativeTest("default symbols and measured disclosure emit warning-free complete iOS bundles in both modes and isolation settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-symbols-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml(html, { name: "DisclosureView", mode, viewport: { width: 390, height: 500 }, css });
      expect(result.code).toContain("MarkswiftDisclosure(isExpanded:");
      expect(result.code).not.toContain("DisclosureGroup(isExpanded:");
      expect(result.code.match(/MarkswiftDisclosureSymbol\(/g)).toHaveLength(2);
      // Unsupported RTL remains on the diagnosed text path; the four proved LTR shapes do not.
      expect(result.code.match(/Text\(verbatim: "•/g)).toHaveLength(1);
      expect(result.code).not.toContain('"Unavailable body"');
      expect(result.diagnostics.some(d => d.notes.join("\n").includes("captured marker text glyph"))).toBe(true);
      const output = join(directory, mode);
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
      for (const isolation of [false, true]) {
        const checked = await typecheck(output, { ...TYPECHECK_TARGET, defaultIsolationMainActor: isolation });
        if (!checked.ok) throw new Error(checked.output);
        expect(checked.ok).toBe(true);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
