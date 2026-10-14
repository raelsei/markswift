/**
 * V4a: every node Chrome's accessibility tree names inside a corpus fixture keeps a counterpart role and
 * name in the converted IR. A loss passes only when an exception names it and the screen reports it.
 */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { inferScreen } from "../../src/analysis/infer.ts";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { serveDir } from "../../src/input/server.ts";
import { walk } from "../../src/model/semantic.ts";
import { axParity, browserAxNodes, type AxNamed } from "../../tools/verify/ax.ts";
import { loadFixtureSet, loadPilot } from "./pilot.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

/** Known losses; each must be reported on the screen by a diagnostic with `feature`. */
const EXCEPTIONS: Array<{ case: string; role: string; name: string; feature: string; reason: string }> = [];

browserTest(
  "every Chrome-named accessibility node has an IR counterpart",
  async () => {
    const browser = new BrowserCapture({ dpr: 1, viewport: { width: 390, height: 2000 }, channel: "chromium" });
    const server = await serveDir(join(import.meta.dir, "fixtures"));
    const unexplained: string[] = [];
    const used = new Set<(typeof EXCEPTIONS)[number]>();
    let checked = 0;
    try {
      await browser.start();
      for (const item of await loadFixtureSet(await loadPilot())) {
        let ax: AxNamed[] = [];
        const captured = await browser.capture(
          {
            screen: item.id,
            theme: "light",
            url: `${server.origin}/${item.fixture}`,
            root: "[data-markswift-root]",
            screenshot: false,
            async prepare(page) {
              await page.addStyleTag({ content: "[data-markswift-root] { width: 100% !important; }" });
              ax = await browserAxNodes(page, "[data-markswift-root]");
            },
          },
          htmlIdentity,
          `ax:${item.fixture}`,
        );
        checked += ax.length;
        const screen = inferScreen(captured.layout, `${item.id}-light`);
        const features = new Set<string>();
        walk(screen.root, (n) => {
          for (const d of n.diagnostics) features.add(d.feature);
        });
        for (const miss of axParity(ax, screen)) {
          const exception = EXCEPTIONS.find(
            (e) => e.case === item.id && e.role === miss.role && e.name === miss.name && features.has(e.feature),
          );
          if (exception) used.add(exception);
          else unexplained.push(`${item.id} ${miss.role} "${miss.name}"`);
        }
      }
    } finally {
      await browser.stop();
      server.stop();
    }
    console.log(`ax-parity: checked ${checked} named nodes`);
    expect(unexplained).toEqual([]);
    expect(EXCEPTIONS.filter((e) => !used.has(e))).toEqual([]);
  },
  600_000,
);
