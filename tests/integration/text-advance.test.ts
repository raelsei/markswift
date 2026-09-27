import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { TextNode } from "../../src/model/semantic.ts";
import { nativeTextAdvances } from "../helpers/native-text-advance.ts";

const nativeBrowserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" && process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

function placedWords(widths: number[], space: number, available: number, step: number, multiplier = 1): Array<{ x: number; y: number }> {
  let x = 0, y = 0;
  return widths.map(width => {
    if (x > 0 && x + space + width * multiplier > available + 0.0001) { x = 0; y += step; }
    const start = x === 0 ? 0 : x + space;
    x = start + width * multiplier;
    return { x: start, y };
  });
}

nativeBrowserTest("actual emitted CoreText word/space advances reproduce independent Chrome word rectangles at three widths", async () => {
  for (const profile of [
    { tag: "h1", size: 23, step: 28, weight: 700, text: "Quotes and documentation blocks" },
    { tag: "h2", size: 18, step: 24, weight: 700, text: "The shape of a sentence" },
    { tag: "p", size: 14, step: 20, weight: 400, text: "Clear structure makes complex work easier to inspect and adapt when the available width changes." },
  ]) {
    const references: Array<{ width: number; words: Array<{ x: number; y: number; w: number }> }> = [];
    let captured: TextNode | undefined;
    for (const width of [390, 320, 500]) {
      const result = await convertHtml(`<${profile.tag} id="sample">${profile.text}</${profile.tag}>`, {
        root: "#sample", name: "FractionalWords", mode: "app", viewport: { width, height: 180 },
        css: `body{margin:0}#sample{margin:0;width:${width - 32}px;font:${profile.weight} ${profile.size}px/${profile.step}px system-ui}`,
        async prepare(page) {
          await page.evaluate(() => document.fonts.ready);
          references.push({ width: width - 32, words: await page.evaluate(() => {
            const element = document.querySelector("#sample")!, text = element.firstChild as Text, box = element.getBoundingClientRect();
            return [...text.data.matchAll(/\S+/g)].map(match => {
              const range = document.createRange(); range.setStart(text, match.index!); range.setEnd(text, match.index! + match[0].length);
              const rect = range.getBoundingClientRect(); return { x: rect.x - box.x, y: rect.y - box.y, w: rect.width };
            });
          }) });
        },
      });
      const node = inferScreen(result.layout, "FractionalWords").root;
      expect(node.kind).toBe("text");
      if (node.kind !== "text") throw new Error("Expected text");
      if (width === 390) captured = node;
      expect(result.code).toContain("nativeWeight: UIFont.Weight.");
    }
    const native = await nativeTextAdvances(profile.text, captured!.runs[0]!.font);
    expect(Math.abs(native.whole - native.widths.reduce((sum, width) => sum + width, 0) - (native.widths.length - 1) * native.space)).toBeLessThan(0.0001);
    for (const reference of references) {
      const positions = placedWords(native.widths, native.space, reference.width, captured!.lineBox!.baselineStep);
      for (const [i, actual] of reference.words.entries()) {
        expect(Math.abs(actual.w - native.widths[i]!)).toBeLessThan(0.1);
        expect(Math.abs(actual.x - positions[i]!.x)).toBeLessThan(0.25);
        expect(actual.y - reference.words[0]!.y).toBe(positions[i]!.y);
      }
      const faulty = placedWords(native.widths, native.space, reference.width, profile.step, 1.2);
      expect(Math.max(...faulty.map((position, i) => Math.abs(position.x - reference.words[i]!.x) + Math.abs(position.y - reference.words[i]!.y + reference.words[0]!.y)))).toBeGreaterThan(5);
    }
  }
}, 60000);
