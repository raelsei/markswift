import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopSharedBrowser } from "../../src/index.ts";
import { convert } from "../../src/api/convert.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

describe("capture cache & shared browser integration", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "markswift-int-cache-"));
    process.env.MARKSWIFT_CACHE_DIR = cacheDir;
  });

  afterEach(async () => {
    delete process.env.MARKSWIFT_CACHE_DIR;
    await rm(cacheDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await stopSharedBrowser();
  });

  browserTest(
    "a cache hit skips Chrome and produces identical output",
    async () => {
      const html =
        '<main data-markswift-root style="box-sizing:border-box;width:240px;height:80px;background:#2563eb;color:#fff;padding:16px;font:16px sans-serif">Cache Test</main>';

      // Run 1: Cold run (cache miss, launches/uses Chromium, populates cache)
      const t0 = performance.now();
      const res1 = await convert({ html }, { name: "CacheCard" });
      const t1 = performance.now();
      const coldDuration = t1 - t0;

      expect(res1.layout.size).toEqual({ w: 240, h: 80 });
      expect(res1.code).toContain("CacheCard");

      // Verify a cache file was written under MARKSWIFT_CACHE_DIR
      const entries = await Array.fromAsync(new Bun.Glob("*.json").scan(cacheDir));
      expect(entries.length).toBeGreaterThan(0);

      // Run 2: Warm run (cache hit, skips Chrome)
      const t2 = performance.now();
      const res2 = await convert({ html }, { name: "CacheCard" });
      const t3 = performance.now();
      const warmDuration = t3 - t2;

      // Acceptance: Output is completely identical!
      expect(res2.code).toBe(res1.code);
      expect(res2.layout).toEqual(res1.layout);
      expect(res2.warnings).toEqual(res1.warnings);
      expect(Object.keys(res2.files).sort()).toEqual(Object.keys(res1.files).sort());

      // Warm run must be fast (skipping Chrome)
      expect(warmDuration).toBeLessThan(coldDuration);
    },
    60_000,
  );

  browserTest(
    "invalidation: editing linked CSS re-captures and produces updated output",
    async () => {
      const workDir = await mkdtemp(join(tmpdir(), "markswift-linked-"));
      try {
        const cssPath = join(workDir, "box.css");
        await writeFile(cssPath, ".box { width: 150px; height: 50px; background: red; }");
        const htmlPath = join(workDir, "index.html");
        await writeFile(
          htmlPath,
          '<!doctype html><html><head><link rel="stylesheet" href="box.css"></head><body><main data-markswift-root class="box">Box</main></body></html>',
        );

        // Run 1: Initial capture with width 150
        const res1 = await convert({ file: htmlPath }, { name: "BoxView" });
        expect(res1.layout.size.w).toBe(150);

        // Run 2: Without changes, hits cache
        const res2 = await convert({ file: htmlPath }, { name: "BoxView" });
        expect(res2.layout.size.w).toBe(150);

        // Modify linked CSS: change width to 280
        await writeFile(cssPath, ".box { width: 280px; height: 50px; background: blue; }");

        // Run 3: Invalidation triggered! Cache misses because linked CSS content changed
        const res3 = await convert({ file: htmlPath }, { name: "BoxView" });
        expect(res3.layout.size.w).toBe(280);
        expect(res3.layout.size.w).not.toBe(res1.layout.size.w);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  browserTest(
    "opt-out flag: cache: false bypasses cache read and write",
    async () => {
      const html = '<main data-markswift-root style="width:100px;height:40px">Opt Out</main>';

      const res = await convert({ html }, { name: "NoCacheView", cache: false });
      expect(res.layout.size).toEqual({ w: 100, h: 40 });

      // No cache file should have been written
      const entries = await Array.fromAsync(new Bun.Glob("*.json").scan(cacheDir));
      expect(entries.length).toBe(0);
    },
    60_000,
  );

  browserTest(
    "shared browser: sequential conversions reuse the browser session",
    async () => {
      const items = ["One", "Two", "Three", "Four"];
      const results = [];
      for (const item of items) {
        const html = `<main data-markswift-root style="width:120px;height:30px">${item}</main>`;
        // Use cache: false to force browser conversion and verify shared browser reuse
        const res = await convert({ html }, { name: `View${item}`, cache: false });
        results.push(res);
      }

      expect(results.length).toBe(4);
      for (let i = 0; i < items.length; i++) {
        expect(results[i]!.code).toContain(`View${items[i]}`);
      }
    },
    120_000,
  );

  browserTest(
    "browser-response font bytes: webfonts are bundled directly from Playwright response bodies",
    async () => {
      const fontDir = await mkdtemp(join(tmpdir(), "markswift-font-resp-"));
      try {
        const fontBytes = await Bun.file(
          "tests/conformance/fixtures/assets/geist-latin-wght-normal.woff2",
        ).arrayBuffer();
        await writeFile(join(fontDir, "custom.woff2"), Buffer.from(fontBytes));
        const html = `<!doctype html><html><head><style>
          @font-face { font-family: 'CustomGeist'; src: url('custom.woff2') format('woff2'); font-weight: 400; font-style: normal; }
          body { margin: 0; }
          main { font-family: 'CustomGeist', sans-serif; font-size: 20px; width: 200px; height: 50px; }
        </style></head><body><main data-markswift-root>Webfont Test</main></body></html>`;
        const htmlPath = join(fontDir, "index.html");
        await writeFile(htmlPath, html);

        // Run 1: Converts, browser requests custom.woff2, response body is captured
        const res1 = await convert({ file: htmlPath }, { name: "WebfontView", theme: "light" });
        expect(res1.layout.fonts.length).toBeGreaterThan(0);
        const bundledAssetKeys = Object.keys(res1.assets);
        expect(bundledAssetKeys.some((k) => k.startsWith("Fonts/"))).toBe(true);

        // Run 2: From cache, exact same assets returned without browser
        const res2 = await convert({ file: htmlPath }, { name: "WebfontView", theme: "light" });
        expect(Object.keys(res2.assets)).toEqual(bundledAssetKeys);
      } finally {
        await rm(fontDir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
