import { expect, test } from "bun:test";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { htmlIdentity } from "../../src/input/identity.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

test.each([0, -1, Infinity, NaN])("capture rejects invalid timeout %s", (timeoutMs) => {
  expect(() => new BrowserCapture({ dpr: 1, viewport: { width: 320, height: 400 }, timeoutMs })).toThrow(
    "capture timeoutMs must be positive and finite",
  );
});

browserTest(
  "a stalled capture names its key and phase, closes the page, and allows the next capture",
  async () => {
    const browser = new BrowserCapture({
      dpr: 1,
      viewport: { width: 320, height: 400 },
      channel: "chromium",
      timeoutMs: 5000,
    });
    await browser.start();
    let closed = false;
    let prepared = false;
    const spec = {
      screen: "stalled",
      theme: "dark" as const,
      url: "http://markswift.test/",
      html: '<main data-markswift-root style="width:100px;height:40px">Hello</main>',
      root: "[data-markswift-root]",
    };
    try {
      const error = await browser
        .capture(
          {
            ...spec,
            prepare: async (page) => {
              prepared = true;
              page.on("close", () => {
                closed = true;
              });
              await page.evaluate(() => new Promise(() => {}));
            },
          },
          htmlIdentity,
          "timeout-fixture",
        )
        .catch((error: unknown) => error);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "capture timeout-fixture/stalled/320/dark timed out after 5000ms during load / prepare",
      );
      const result = await browser.capture(spec, htmlIdentity, "recovered-fixture");
      expect(prepared).toBe(true);
      expect(closed).toBe(true);
      expect(result.layout.size).toEqual({ w: 100, h: 40 });
    } finally {
      await browser.stop();
    }
  },
  15_000,
);

browserTest(
  "navigation can use the capture deadline beyond Playwright's default 30 seconds",
  async () => {
    const server = Bun.serve({
      port: 0,
      idleTimeout: 60,
      async fetch() {
        await Bun.sleep(31_000);
        return new Response('<main style="width:100px;height:40px">Loaded</main>', {
          headers: { "Content-Type": "text/html" },
        });
      },
    });
    const browser = new BrowserCapture({
      dpr: 1,
      viewport: { width: 320, height: 400 },
      channel: "chromium",
      timeoutMs: 60_000,
    });
    try {
      await browser.start();
      const result = await browser.capture(
        {
          screen: "slow-navigation",
          theme: "light",
          url: `http://127.0.0.1:${server.port}/`,
          root: "main",
          screenshot: false,
        },
        htmlIdentity,
        "slow-navigation-fixture",
      );
      expect(result.layout.size).toEqual({ w: 100, h: 40 });
    } finally {
      await browser.stop();
      server.stop(true);
    }
  },
  90_000,
);
