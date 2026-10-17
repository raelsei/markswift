import { expect, test } from "bun:test";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { htmlIdentity } from "../../src/input/identity.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "an indeterminate <progress> is screenshotted at its first frame, however long the page ran",
  async () => {
    const browser = new BrowserCapture({ dpr: 2, viewport: { width: 390, height: 800 }, channel: "chromium" });
    await browser.start();
    try {
      // Blink's bar moves with the clock (2.5 s cycle): 0 vs 700 ms after load lands on different frames unless frozen.
      const shot = async (wait: number) =>
        (
          await browser.capture(
            {
              screen: "t",
              theme: "light",
              url: "http://markswift.test/",
              html: '<main data-markswift-root style="width:300px;padding:8px"><progress style="width:100%"></progress></main>',
              root: "[data-markswift-root]",
              screenshot: true,
              prepare: (page) => page.waitForTimeout(wait),
            },
            htmlIdentity,
            "progress-test",
          )
        ).png!;
      expect(Bun.hash(await shot(0))).toBe(Bun.hash(await shot(700)));
    } finally {
      await browser.stop();
    }
  },
  60000,
);
