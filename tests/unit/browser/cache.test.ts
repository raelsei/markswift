import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearCaptureCache,
  computeCacheKey,
  hashLinkedResources,
  readCaptureCache,
  writeCaptureCache,
} from "../../../src/browser/cache.ts";
import type { Capture } from "../../../src/browser/capture.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc } from "../../../src/model/layout.ts";

describe("capture cache keys", () => {
  const baseParams = {
    html: '<main data-markswift-root style="width:100px;height:100px">Hello</main>',
    linkedResources: "abc123hash",
    viewport: { width: 390, height: 844 },
    theme: "light",
    browserVersion: "153.0.8010.12",
    captureCodeVersion: `v2.0.0-ld${LAYOUT_DOC_VERSION}`,
    root: "[data-markswift-root]",
  };

  test("computes deterministic SHA-256 cache key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey(baseParams);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("invalidation: different HTML produces different key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey({ ...baseParams, html: "<main>Changed</main>" });
    expect(key1).not.toBe(key2);
  });

  test("invalidation: different linked resources produce different key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey({ ...baseParams, linkedResources: "different_hash" });
    expect(key1).not.toBe(key2);
  });

  test("invalidation: different viewport produces different key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey({ ...baseParams, viewport: { width: 320, height: 568 } });
    expect(key1).not.toBe(key2);
  });

  test("invalidation: different theme produces different key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey({ ...baseParams, theme: "dark" });
    expect(key1).not.toBe(key2);
  });

  test("invalidation: different browser version produces different key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey({ ...baseParams, browserVersion: "154.0.0.0" });
    expect(key1).not.toBe(key2);
  });

  test("invalidation: different capture code version produces different key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey({ ...baseParams, captureCodeVersion: "v2.1.0-ld6" });
    expect(key1).not.toBe(key2);
  });

  test("invalidation: different css, darkClass or open triggers produce different key", () => {
    const key1 = computeCacheKey(baseParams);
    const key2 = computeCacheKey({ ...baseParams, css: "body { background: red; }" });
    const key3 = computeCacheKey({ ...baseParams, darkClass: "dark" });
    const key4 = computeCacheKey({ ...baseParams, open: "trigger-1:0/1" });
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).not.toBe(key4);
  });
});

describe("hashLinkedResources", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "markswift-cache-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("returns empty string when no baseDir or no linked resources", async () => {
    expect(await hashLinkedResources("<main>Hello</main>")).toBe("");
    expect(await hashLinkedResources("<main>Hello</main>", dir)).toBe("");
  });

  test("hashes linked stylesheets and updates when stylesheet content changes", async () => {
    const cssFile = join(dir, "style.css");
    await writeFile(cssFile, "body { color: red; }");
    const html = '<link rel="stylesheet" href="style.css"><main>Hello</main>';

    const hash1 = await hashLinkedResources(html, dir);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    // Same content produces same hash
    const hash2 = await hashLinkedResources(html, dir);
    expect(hash2).toBe(hash1);

    // Changing file content changes hash (invalidating stale cache)
    await writeFile(cssFile, "body { color: blue; font-size: 20px; }");
    const hash3 = await hashLinkedResources(html, dir);
    expect(hash3).not.toBe(hash1);
  });

  test("follows recursive CSS imports", async () => {
    await writeFile(join(dir, "main.css"), '@import "sub.css";\nbody { margin: 0; }');
    await writeFile(join(dir, "sub.css"), "h1 { color: green; }");
    const html = '<link rel="stylesheet" href="main.css"><h1>Test</h1>';

    const hash1 = await hashLinkedResources(html, dir);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    // Modifying sub.css changes the hash
    await writeFile(join(dir, "sub.css"), "h1 { color: purple; }");
    const hash2 = await hashLinkedResources(html, dir);
    expect(hash2).not.toBe(hash1);
  });

  test("data URLs need no hash; remote or missing resources make the capture uncacheable", async () => {
    expect(await hashLinkedResources('<img src="data:image/png;base64,123">', dir)).toBe("");
    // Nothing would notice these change, so the capture must not be cached.
    expect(
      await hashLinkedResources('<link rel="stylesheet" href="https://example.com/ext.css">', dir),
    ).toBeUndefined();
    expect(await hashLinkedResources('<img src="//cdn.test/img.png">', dir)).toBeUndefined();
    expect(await hashLinkedResources('<img src="missing.png">', dir)).toBeUndefined();
  });

  test("relative links resolve from the document's directory, root-relative ones from the served root", async () => {
    await mkdir(join(dir, "components"), { recursive: true });
    await writeFile(join(dir, "components", "card.css"), "a{}");
    await writeFile(join(dir, "site.css"), "b{}");
    const html = '<link rel="stylesheet" href="card.css"><link rel="stylesheet" href="/site.css">';
    const before = await hashLinkedResources(html, dir, undefined, join(dir, "components"));
    expect(before).toBeString();
    await writeFile(join(dir, "components", "card.css"), "a{color:red}");
    expect(await hashLinkedResources(html, dir, undefined, join(dir, "components"))).not.toBe(before);
  });
});

describe("cache read/write/clear", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "markswift-cache-io-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  const dummyLayout: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "test.html",
    combo: { screen: "TestView", theme: "light" },
    size: { w: 390, h: 200 },
    viewport: { x: 0, y: 0, w: 390, h: 844 },
    conditions: [],
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root: {
      tag: "main",
      attrs: { "data-markswift-root": "1" },
      bounds: { x: 0, y: 0, w: 390, h: 200 },
      styles: { display: "block" },
      children: [],
    },
  };

  test("writes and reads capture matching layout, fontFiles, and warnings", async () => {
    const fontBytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x01, 0x02]);
    const capture: Capture = {
      layout: dummyLayout,
      warnings: [{ source: "capture", message: "Test warning" }],
      fontFiles: [{ file: "_fonts/abc123.woff2", bytes: fontBytes }],
      png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    };

    const key = "test-key-12345";
    expect(await readCaptureCache(key, cacheDir)).toBeUndefined();

    await writeCaptureCache(key, capture, cacheDir);
    const restored = await readCaptureCache(key, cacheDir);
    expect(restored).toBeDefined();
    expect(restored!.layout).toEqual(dummyLayout);
    expect(restored!.warnings).toEqual(capture.warnings);
    expect(restored!.fontFiles.length).toBe(1);
    expect(restored!.fontFiles[0]!.file).toBe("_fonts/abc123.woff2");
    expect(restored!.fontFiles[0]!.bytes).toEqual(fontBytes);
    expect(restored!.png).toEqual(capture.png);
  });

  test("clearCaptureCache removes cached entries", async () => {
    const capture: Capture = {
      layout: dummyLayout,
      warnings: [],
      fontFiles: [],
    };
    await writeCaptureCache("entry1", capture, cacheDir);
    await writeCaptureCache("entry2", capture, cacheDir);

    expect(await readCaptureCache("entry1", cacheDir)).toBeDefined();
    expect(await readCaptureCache("entry2", cacheDir)).toBeDefined();

    const cleared = await clearCaptureCache(cacheDir);
    expect(cleared).toBe(2);

    expect(await readCaptureCache("entry1", cacheDir)).toBeUndefined();
    expect(await readCaptureCache("entry2", cacheDir)).toBeUndefined();
  });
});
