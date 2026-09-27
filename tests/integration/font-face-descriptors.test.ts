import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { collectFontFaces } from "../../src/browser/fonts.ts";
import { FontFace } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("source axis descriptors survive collection and cannot collapse into element normal", async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>
      @font-face{font-family:Descriptor;src:url("https://unused.test/font.woff2");font-weight:100 900}
      @font-face{font-family:Descriptor;src:url("https://unused.test/font.woff2");font-weight:100 900;font-variation-settings:"opsz" 24}
      main{font-family:system-ui;font-variation-settings:normal}
    </style><main>Text</main>`);
    const faces = (await collectFontFaces(page)).map(face => FontFace.parse(face));
    expect(faces).toHaveLength(2);
    expect(faces.map(face => face.variationSettings)).toEqual(["normal", '"opsz" 24']);
    expect(await page.locator("main").evaluate(element => getComputedStyle(element).fontVariationSettings)).toBe("normal");
    const { variationSettings: _descriptor, ...legacy } = faces[0]!;
    expect(FontFace.parse(legacy).variationSettings).toBeUndefined();
  } finally { await browser.close(); }
}, 30000);
