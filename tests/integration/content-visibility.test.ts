import { expect, test } from "bun:test";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { LayoutNode } from "../../src/model/layout.ts";
import { chromium } from "playwright-core";
import { settle } from "../../src/browser/settle.ts";
import { readSourceContentVisibility, attachSourceContentVisibility } from "../../src/browser/content-visibility.ts";
import { snapshotToTree, type DomSnapshot } from "../../src/browser/snapshot.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;

browserTest("a visibility mutation between origin capture and settling retains the actual forced object", async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.setContent('<main><label>Text</label></main>');
    const cdp = await page.context().newCDPSession(page);
    let source = new Map();
    const forced = await settle(page, [], async () => {
      source = new Map(readSourceContentVisibility(await cdp.send("DOMSnapshot.captureSnapshot", { computedStyles: ["content-visibility"] }) as unknown as DomSnapshot));
      await page.evaluate(() => document.querySelector("main")!.style.setProperty("content-visibility", "auto"));
    }, cdp);
    const tree = snapshotToTree(await cdp.send("DOMSnapshot.captureSnapshot", { computedStyles: ["content-visibility"] }) as unknown as DomSnapshot);
    attachSourceContentVisibility(tree, source, forced);
    const find = (node: typeof tree): typeof tree | undefined => node.name === "main" ? node : node.children.map(find).find(Boolean);
    expect(find(tree)?.sourceContentVisibility).toBe("auto");
    expect(await page.locator("main").evaluate(el => getComputedStyle(el).contentVisibility)).toBe("visible");
    await cdp.detach();
  } finally { await browser.close(); }
}, 30000);

for (const visibility of ["visible", "auto"] as const) {
  browserTest(`original content-visibility:${visibility} survives capture and schema validation`, async () => {
    const browser = new BrowserCapture({ dpr: 1, viewport: { width: 390, height: 400 } });
    await browser.start();
    try {
      const result = await browser.capture({ key: "visibility", screen: "visibility", theme: "light", url: "http://capture.test/", root: "main",
        html: `<style>html,body{margin:0}main{width:200px;min-height:40px;content-visibility:${visibility}}</style><main><label>Visible text</label></main>` },
        (_tag, attrs, path) => attrs.id ?? path, "visibility.html");
      expect(result.layout.root.styles["content-visibility"]).toBe("visible");
      expect(LayoutNode.parse(result.layout.root).sourceContentVisibility).toBe(visibility);
      expect(result.layout.root.children[0]?.sourceContentVisibility).toBe("visible");
      expect(result.warnings.some(warning => warning.includes("content-visibility:auto") && warning.includes("forced"))).toBe(visibility === "auto");
      expect(result.domHtml).not.toContain("backendNodeId");
    } finally { await browser.stop(); }
  }, 30000);
}

browserTest("a replacement DOM object with identical markup cannot inherit source visibility proof", async () => {
  const browser = new BrowserCapture({ dpr: 1, viewport: { width: 390, height: 400 } });
  await browser.start();
  try {
    const result = await browser.capture({ key: "replacement", screen: "replacement", theme: "light", url: "http://capture.test/", root: "main",
      html: '<style>main{width:200px;min-height:40px}</style><main><label id="same">Visible text</label></main>',
      observeSnapshot: async page => { await page.evaluate(() => { const label = document.querySelector("label")!; label.replaceWith(label.cloneNode(true)); }); } },
      (_tag, attrs, path) => attrs.id ?? path, "replacement.html");
    expect(result.layout.root.sourceContentVisibility).toBe("visible");
    expect(result.layout.root.children[0]?.id).toBe("same");
    expect(result.layout.root.children[0]?.sourceContentVisibility).toBeUndefined();
  } finally { await browser.stop(); }
}, 30000);
