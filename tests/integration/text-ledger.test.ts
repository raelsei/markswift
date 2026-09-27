import { expect, test } from "bun:test";
import { chromium, type Page } from "playwright-core";
import { readChromeTextLedger, utf16Hash } from "../../tools/verify/text-ledger-chrome.ts";
import { validateTextProjection } from "../../tools/verify/text-projection.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
async function withPage(html: string, inspect: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 });
    await page.setContent(html); await inspect(page);
  } finally { await browser.close(); }
}

browserTest("live ledger retains comment positions, display:contents, empty/hidden text and duplicate author ids passively", async () => {
  await withPage('<!doctype html><style>body{margin:0}main{width:390px;height:150px}.contents{display:contents}.hidden{display:none}</style><main id="root"><!-- counts --><span id="duplicate">same</span><span id="duplicate" class="contents">same</span><span class="hidden">hidden</span><br><wbr></main>', async page => {
    await page.evaluate(() => document.querySelector("main")!.append(document.createTextNode("")));
    const before = await page.locator("main").screenshot(), observed = await readChromeTextLedger(page, "main"), after = await page.locator("main").screenshot();
    expect(before.equals(after)).toBe(true);
    expect(observed.nodes.find(node => node.key === "dom:/0")!.type).toBe(8);
    expect(observed.occurrences.map(source => [source.key, source.kind, source.raw])).toEqual([
      ["dom:/1/0", "text", "same"], ["dom:/2/0", "text", "same"], ["dom:/3/0", "text", "hidden"],
      ["dom:/4", "br", ""], ["dom:/5", "wbr", ""], ["dom:/6", "text", ""],
    ]);
    expect(observed.occurrences[1]!.ancestors.at(-1)!.display).toBe("contents");
    expect(observed.occurrences[1]!.rendering).toBe("visible");
    expect(observed.occurrences[2]!.rendering).toBe("suppressed");
    expect(observed.occurrences[2]!.rawUtf16Sha256).toBe(utf16Hash("hidden"));
    expect(observed.root.externalAncestors.map(ancestor => ancestor.tag)).toEqual(["body", "html"]);
    expect(observed.document.deviceScaleFactor).toBe(2);
  });
}, 30_000);

browserTest("visibility override cannot be falsely suppressed through an ancestor; astral ranges use raw UTF16", async () => {
  await withPage('<!doctype html><main style="visibility:hidden"><span style="visibility:visible">A😀B</span></main>', async page => {
    const observed = await readChromeTextLedger(page, "main"), source = observed.occurrences[0]!;
    expect(source.rendering).toBe("visible"); expect(source.suppression).toEqual([]);
    expect(source.raw).toBe("A😀B"); expect(source.ranges.map(range => [range.start, range.end])).toEqual([[0, 1], [1, 3], [3, 4]]);
    expect(source.ranges.every(range => range.fragments.some(rect => rect.w > 0))).toBe(true);
  });
}, 30_000);

browserTest("raw collapsed separators and cross-occurrence whitespace remain observed but independently unavailable", async () => {
  await withPage('<!doctype html><main>word <span style="display:contents">  next</span></main>', async page => {
    const observed = await readChromeTextLedger(page, "main");
    expect(observed.occurrences.map(source => source.raw)).toEqual(["word ", "  next"]);
    expect(observed.occurrences[1]!.ranges.slice(0, 2)).toHaveLength(2);
    const emitted = observed.occurrences.map((source, index) => ({ key: `emit/${index}`, literal: source.raw, literalUtf16Sha256: utf16Hash(source.raw),
      source: { version: 1 as const, units: [{ output: [0, source.raw.length] as [number, number], operation: "copy" as const,
        sources: [{ occurrence: source.key, start: 0, end: source.raw.length }] }], excluded: [], unavailable: [] } }));
    expect(validateTextProjection(observed, emitted).accounted).toBe(false);
    expect(validateTextProjection(observed, emitted).unavailable.some(reason => reason.includes("whitespace"))).toBe(true);
  });
}, 30_000);

browserTest("pseudo/control/shadow origins and closed disclosure scopes cannot silently disappear from text completeness", async () => {
  await withPage('<!doctype html><style>main::before{content:"generated"}</style><main><x-host></x-host><input value="dynamic"><details><summary>title</summary><p>closed</p></details></main>', async page => {
    await page.evaluate(() => document.querySelector("x-host")!.attachShadow({ mode: "closed" }).append(document.createTextNode("closed shadow")));
    const observed = await readChromeTextLedger(page, "main");
    expect(observed.unavailable.some(reason => reason.includes("generated"))).toBe(true);
    expect(observed.unavailable.some(reason => reason.includes("shadow"))).toBe(true);
    expect(observed.unavailable.some(reason => reason.includes("dynamic"))).toBe(true);
    const closed = observed.occurrences.find(source => source.raw === "closed")!;
    expect(closed.rendering).toBe("unavailable");
    expect(validateTextProjection(observed, []).accounted).toBe(false);
  });
}, 30_000);
