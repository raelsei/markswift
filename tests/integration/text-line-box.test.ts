import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTextMetrics, attachTextMetrics } from "../../src/browser/text-metrics.ts";
import { snapshotToTree, findByAttr, toLayout, type DomSnapshot } from "../../src/browser/snapshot.ts";
import { STYLE_WHITELIST } from "../../src/model/layout.ts";
import { convertHtml } from "../../src/index.ts";
import { TYPECHECK_TARGET, typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? browserTest : test.skip;

browserTest("canvas font boxes joined to CDP match independent zero-height DOM baseline markers", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 500, height: 300 } });
    for (const width of [320, 390, 500]) {
      await page.setContent(`<style>body{margin:0}main{padding:7px 11px}p{margin:0;width:${width - 40}px}
        #heading{font:700 23px/28px system-ui}#subheading{font:700 18px/24px system-ui}#body{font:14px/20px system-ui}</style>
        <main id="root"><p id="heading">Editorial typography</p><p id="subheading">The shape of a sentence</p>
        <p id="body">Clear structure makes complex work easier to inspect and adapt when the available width changes.</p></main>`);
      await page.evaluate(() => document.fonts.ready);
      const metrics = await readTextMetrics(page, "#root");
      const session = await page.context().newCDPSession(page);
      const snapshot = await session.send("DOMSnapshot.captureSnapshot", { computedStyles: [...STYLE_WHITELIST], includeDOMRects: true }) as unknown as DomSnapshot;
      await session.detach();
      const tree = snapshotToTree(snapshot), root = findByAttr(tree, "id", "root")!;
      attachTextMetrics(root, metrics);
      const origin = await page.locator("#root").boundingBox();
      const layout = toLayout(root, origin!, (_, attrs) => attrs.id)!;
      const markers = await page.evaluate(() => {
        const result: Record<string, number[]> = {};
        for (const element of document.querySelectorAll("p")) {
          const text = element.firstChild as Text;
          const starts: number[] = [];
          let previousY = -Infinity;
          for (let i = 0; i < text.length; i++) {
            if (/\s/.test(text.data[i]!)) continue;
            const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1);
            const y = range.getBoundingClientRect().y;
            if (y > previousY + 1) { starts.push(i); previousY = y; }
          }
          const created: HTMLElement[] = [];
          for (const start of starts.reverse()) {
            const tail = text.splitText(start), marker = document.createElement("span");
            marker.style.cssText = "display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline";
            // Keep the marker with the next unbreakable word; an isolated zero-width inline
            // block can itself fit on the preceding line and would measure the wrong line.
            const word = tail.data.match(/^\S+/)![0]; tail.splitText(word.length);
            const group = document.createElement("span"); group.style.whiteSpace = "nowrap";
            element.insertBefore(group, tail); group.append(marker, tail); created.unshift(marker);
          }
          result[element.id] = created.map(marker => marker.getBoundingClientRect().y - document.querySelector("#root")!.getBoundingClientRect().y);
        }
        return result;
      });
      for (const node of layout.children.filter(node => node.tag === "p")) {
        const text = node.children.find(child => child.tag === "#text")!;
        expect(text.firstBaseline).toBeDefined();
        const baselines = [...new Set(text.lines?.map(line => line.baseline) ?? [text.firstBaseline])];
        expect(baselines).toEqual(markers[node.attrs.id!]!);
      }
    }
  } finally { await browser.close(); }
}, 30000);

browserTest("unsupported and shadow text leave baseline metadata absent without joining the wrong text child", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="root" style="font:14px/20px system-ui"> first <span>plain</span> second <p dir="rtl">RTL</p><p>Fallback \u4e2d</p><x-host></x-host></main>');
    await page.evaluate(() => { document.querySelector("x-host")!.attachShadow({ mode: "open" }).innerHTML = '<p>Shadow content</p>'; });
    const metrics = await readTextMetrics(page, "#root");
    expect(metrics["/#text:0"]).toBeDefined();
    expect(metrics["/#text:1"]).toBeDefined();
    expect(metrics["0/#text:0"]).toBeDefined();
    expect(metrics["1/#text:0"]).toBeUndefined();
    expect(metrics["2/#text:0"]).toBeUndefined();
    expect(metrics["3/0/#text:0"]).toBeUndefined();
  } finally { await browser.close(); }
}, 30000);

nativeTest("actual captured baseline expressions compile as complete iOS bundles in both modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-native-line-box-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml('<main data-markswift-root><h1>Editorial typography</h1><h2>The shape of a sentence</h2><p>Clear structure makes complex work easier to inspect and adapt at a narrower width.</p><div>Native Text uses measured baseline geometry.</div><p style="text-align:center">Centered text keeps its captured alignment when it wraps over two lines.</p><p style="text-align:right">Trailing text keeps its captured alignment when it wraps over two lines.</p></main>', {
        name: "MeasuredBaseline", mode, viewport: { width: 390, height: 300 },
        css: 'body{margin:0}main{box-sizing:border-box;width:100%;padding:16px;font:14px/20px system-ui;background:white;color:black}h1,h2,p{margin:0}h1{font:700 23px/28px system-ui}h2{font:700 18px/24px system-ui}',
      });
      expect(result.code.match(/MarkswiftTextLineBox\(/g)?.length).toBe(6);
      expect(result.code).toContain("horizontal: .center");
      expect(result.code).toContain("horizontal: .trailing");
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
