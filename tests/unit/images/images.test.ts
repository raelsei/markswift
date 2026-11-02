import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { serveDir } from "../../../src/input/server.ts";
import {
  parseSrcset,
  select2xCandidate,
  determineScale,
  resolveImageUrl,
  fetchImageBytes,
  downloadRemoteImages,
  toAssetCatalog,
} from "../../../src/images/index.ts";
import { parseImageSet } from "../../../src/css/index.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("URL resolution", () => {
  const base = "http://localhost:8080/app/page.html";

  test("resolves relative path beside document", () => {
    expect(resolveImageUrl("photo.png", base)).toBe("http://localhost:8080/app/photo.png");
  });

  test("resolves parent-directory relative path", () => {
    expect(resolveImageUrl("../assets/logo@2x.png", base)).toBe("http://localhost:8080/assets/logo@2x.png");
  });

  test("resolves root-relative path", () => {
    expect(resolveImageUrl("/static/hero.webp", base)).toBe("http://localhost:8080/static/hero.webp");
  });

  test("preserves absolute HTTP and HTTPS URLs", () => {
    expect(resolveImageUrl("https://cdn.example.com/pic.jpg", base)).toBe("https://cdn.example.com/pic.jpg");
    expect(resolveImageUrl("http://remote.host/img.png", base)).toBe("http://remote.host/img.png");
  });

  test("preserves data: URLs, hash fragments and empty strings", () => {
    expect(resolveImageUrl("data:image/png;base64,abc", base)).toBe("data:image/png;base64,abc");
    expect(resolveImageUrl("#vector", base)).toBe("#vector");
    expect(resolveImageUrl("", base)).toBe("");
  });
});

describe("density selection", () => {
  describe("parseSrcset", () => {
    test("parses single 1x candidate", () => {
      expect(parseSrcset("pic.png")).toEqual([{ url: "pic.png", density: 1 }]);
    });

    test("parses 1x and 2x density descriptors", () => {
      const parsed = parseSrcset("pic.png 1x, pic@2x.png 2x");
      expect(parsed).toEqual([
        { url: "pic.png", density: 1 },
        { url: "pic@2x.png", density: 2 },
      ]);
    });

    test("parses width descriptors", () => {
      const parsed = parseSrcset("pic-300.jpg 300w, pic-600.jpg 600w");
      expect(parsed).toEqual([
        { url: "pic-300.jpg", width: 300 },
        { url: "pic-600.jpg", width: 600 },
      ]);
    });

    test("select2xCandidate picks the 2x candidate", () => {
      const candidates = parseSrcset("pic.png 1x, pic@2x.png 2x");
      expect(select2xCandidate(candidates)).toEqual({ url: "pic@2x.png", density: 2 });
    });

    test("select2xCandidate falls back to 1x when no 2x exists", () => {
      const candidates = parseSrcset("pic.png 1x");
      expect(select2xCandidate(candidates)).toEqual({ url: "pic.png", density: 1 });
    });
  });

  describe("parseImageSet", () => {
    test("parses image-set with 1x and 2x candidates", () => {
      const css = 'image-set(url("back.png") 1x, url("back@2x.png") 2x)';
      const parsed = parseImageSet(css);
      expect(parsed).toEqual([
        { url: "back.png", density: 1 },
        { url: "back@2x.png", density: 2 },
      ]);
    });

    test("parses -webkit-image-set with quotes and dpi units", () => {
      const css = '-webkit-image-set("img.png" 96dpi, "img@2x.png" 192dpi)';
      const parsed = parseImageSet(css);
      expect(parsed).toEqual([
        { url: "img.png", density: 1 },
        { url: "img@2x.png", density: 2 },
      ]);
    });

    test("returns undefined for non-image-set", () => {
      expect(parseImageSet('url("simple.png")')).toBeUndefined();
    });
  });

  describe("determineScale", () => {
    // 1x1 PNG data URL
    const png1x1 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // 2x2 PNG data URL
    const png2x2 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/AwMDEwMDAwAAAAAUAAdfzH6sAAAAASUVORK5CYII=";

    const makeNode = (bounds: { w: number; h: number }, attrs: Record<string, string> = {}): LayoutNode => ({
      tag: "img",
      attrs,
      styles: {},
      bounds: { x: 0, y: 0, ...bounds },
      children: [],
    });

    test("uses explicit data-markswift-scale attribute when set", () => {
      const node = makeNode({ w: 100, h: 100 }, { "data-markswift-scale": "2" });
      expect(determineScale(node, png1x1)).toBe(2);
    });

    test("a 2x srcset candidate counts only when the browser chose it", () => {
      const srcset = { srcset: "a.png 1x, a@2x.png 2x" };
      expect(determineScale({ ...makeNode({ w: 100, h: 100 }, srcset), currentSrc: "http://x/a@2x.png" }, png1x1)).toBe(
        2,
      );
      expect(determineScale({ ...makeNode({ w: 100, h: 100 }, srcset), currentSrc: "http://x/a.png" }, png1x1)).toBe(1);
      // No currentSrc: nothing says which candidate is shown.
      expect(determineScale(makeNode({ w: 100, h: 100 }, srcset), png1x1)).toBe(1);
    });

    test("detects 2x scale from natural dimensions vs rendered bounds", () => {
      // 2x2 natural pixels in 1x1 bounds -> scale 2
      const node = makeNode({ w: 1, h: 1 });
      expect(determineScale(node, png2x2)).toBe(2);
    });

    test("detects 1x scale when natural dimensions match rendered bounds", () => {
      // 1x1 natural pixels in 1x1 bounds -> scale 1
      const node = makeNode({ w: 1, h: 1 });
      expect(determineScale(node, png1x1)).toBe(1);
    });

    test("detects 2x scale from srcset attribute", () => {
      const node = makeNode({ w: 50, h: 50 }, { srcset: "pic.png 1x, pic@2x.png 2x" });
      node.currentSrc = "pic@2x.png";
      expect(determineScale(node, png1x1)).toBe(2);
    });
  });
});

describe("catalog Contents.json", () => {
  const dummyPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  test("generates root and imageset Contents.json with correct scales", () => {
    const assets: Record<string, Uint8Array> = {
      "Images/logo.png": dummyPng,
      "Images/logo@2x.png": dummyPng,
    };

    const catalog = toAssetCatalog(assets);

    // Root Contents.json
    expect(catalog["Assets.xcassets/Contents.json"]).toBeDefined();
    const rootJson = JSON.parse(new TextDecoder().decode(catalog["Assets.xcassets/Contents.json"]!));
    expect(rootJson).toEqual({
      info: { author: "xcode", version: 1 },
    });

    // Imageset Contents.json
    expect(catalog["Assets.xcassets/logo.imageset/Contents.json"]).toBeDefined();
    const imagesetJson = JSON.parse(new TextDecoder().decode(catalog["Assets.xcassets/logo.imageset/Contents.json"]!));
    expect(imagesetJson.info).toEqual({ author: "xcode", version: 1 });
    expect(imagesetJson.images).toEqual([
      { idiom: "universal", scale: "1x", filename: "logo.png" },
      { idiom: "universal", scale: "2x", filename: "logo@2x.png" },
      { idiom: "universal", scale: "3x" },
    ]);

    // Image payload files preserved inside imageset
    expect(catalog["Assets.xcassets/logo.imageset/logo.png"]).toEqual(dummyPng);
    expect(catalog["Assets.xcassets/logo.imageset/logo@2x.png"]).toEqual(dummyPng);
  });

  test("handles single @2x asset in an imageset", () => {
    const assets: Record<string, Uint8Array> = {
      "Images/hero@2x.png": dummyPng,
    };

    const catalog = toAssetCatalog(assets);
    const json = JSON.parse(new TextDecoder().decode(catalog["Assets.xcassets/hero.imageset/Contents.json"]!));
    expect(json.images).toEqual([
      { idiom: "universal", scale: "1x" },
      { idiom: "universal", scale: "2x", filename: "hero@2x.png" },
      { idiom: "universal", scale: "3x" },
    ]);
  });
});

describe("remote image download via local static server", () => {
  let testDir: string;
  let server: { origin: string; stop(): void };

  const png1x1Bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const png2x2Bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/AwMDEwMDAwAAAAAUAAdfzH6sAAAAASUVORK5CYII=",
    "base64",
  );

  beforeAll(async () => {
    testDir = join(tmpdir(), `markswift-img-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "test.png"), png1x1Bytes);
    await writeFile(join(testDir, "test@2x.png"), png2x2Bytes);
    server = await serveDir(testDir);
  });

  afterAll(async () => {
    server.stop();
    await rm(testDir, { recursive: true, force: true });
  });

  test("downloads image bytes successfully over HTTP", async () => {
    const res = await fetchImageBytes(`${server.origin}/test.png`);
    expect("bytes" in res).toBe(true);
    if ("bytes" in res) {
      expect(res.bytes).toEqual(new Uint8Array(png1x1Bytes));
      expect(res.ext).toBe("png");
      expect(res.mime).toBe("image/png");
    }
  });

  test("downloadRemoteImages inlines remote img src and selects 2x srcset candidate", async () => {
    const root: LayoutNode = {
      tag: "img",
      attrs: {
        src: `${server.origin}/test.png`,
        srcset: `${server.origin}/test.png 1x, ${server.origin}/test@2x.png 2x`,
      },
      styles: {},
      bounds: { x: 0, y: 0, w: 1, h: 1 },
      children: [],
    };
    const doc: LayoutDoc = {
      version: 5,
      source: `${server.origin}/index.html`,
      combo: { screen: "ConvertedView", theme: "light" },
      size: { w: 390, h: 844 },
      viewport: { x: 0, y: 0, w: 390, h: 844 },
      dpr: 1,
      canvas: "rgb(255, 255, 255)",
      root,
      conditions: [],
      fonts: [],
    };

    const warnings = await downloadRemoteImages([doc], server.origin);
    expect(warnings).toHaveLength(0);
    expect(root.currentSrc).toStartWith("data:image/png;base64,");
    expect(root.attrs["data-markswift-scale"]).toBe("2");
  });

  test("reports warning diagnostic when remote download fails (HTTP 404)", async () => {
    const root: LayoutNode = {
      tag: "img",
      attrs: { src: `${server.origin}/missing.png` },
      styles: {},
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      children: [],
    };
    const doc: LayoutDoc = {
      version: 5,
      source: `${server.origin}/index.html`,
      combo: { screen: "ConvertedView", theme: "light" },
      size: { w: 390, h: 844 },
      viewport: { x: 0, y: 0, w: 390, h: 844 },
      dpr: 1,
      canvas: "rgb(255, 255, 255)",
      root,
      conditions: [],
      fonts: [],
    };

    const warnings = await downloadRemoteImages([doc], server.origin);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.message).toContain("Remote image could not be downloaded");
    // Fallback URL retained as today
    expect(root.currentSrc ?? root.attrs.src).toBe(`${server.origin}/missing.png`);
  });

  test("rejects image exceeding max size limit", async () => {
    const res = await fetchImageBytes(`${server.origin}/test.png`, { maxBytes: 5 });
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.error).toContain("exceeds size limit");
    }
  });
});
