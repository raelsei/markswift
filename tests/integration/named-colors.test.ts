/** Guards the CSS named-colour table against typos: every entry must match Chrome's computed colour. */
import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { NAMED_COLORS, parseColor } from "../../src/css/color.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("NAMED_COLORS matches Chrome's computed colours", async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage();
    const computed = await page.evaluate((names) => {
      const div = document.createElement("div");
      document.body.append(div);
      return names.map((name) => {
        div.style.color = name;
        return getComputedStyle(div).color;
      });
    }, Object.keys(NAMED_COLORS));
    const mismatches = Object.keys(NAMED_COLORS).flatMap((name, i) => {
      const [r, g, b] = /rgb\((\d+), (\d+), (\d+)\)/.exec(computed[i]!)!.slice(1).map((v) => +v / 255);
      return JSON.stringify(parseColor(name)) === JSON.stringify({ r, g, b, a: 1 }) ? [] : [`${name}: ${computed[i]}`];
    });
    expect(Object.keys(NAMED_COLORS).length).toBe(148);
    expect(mismatches).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60000);
