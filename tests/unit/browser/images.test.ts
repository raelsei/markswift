import { expect, test } from "bun:test";
import { inlineCapturedImages } from "../../../src/browser/images.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

test("image capture resolves selected picture candidate and CSS URLs against the document base", () => {
  const root: LayoutNode = {
    tag: "img", attrs: { src: "unused.png", "data-h2s-src": "selected.png" },
    styles: { "background-image": 'url("back.png"), url("data:image/png;base64,xyz")' },
    bounds: { x: 0, y: 0, w: 10, h: 10 }, children: [],
  };
  const images = new Map([["http://localhost/assets/selected.png", "data:image/png;base64,a"], ["http://localhost/assets/back.png", "data:image/png;base64,b"]]);
  expect(inlineCapturedImages(root, "http://localhost/assets/", images)).toEqual([]);
  expect(root.attrs["data-h2s-src"]).toBe("data:image/png;base64,a");
  expect(root.styles["background-image"]).toBe('url("data:image/png;base64,b"), url("data:image/png;base64,xyz")');
});

test("uncaptured images report an explicit warning rather than imply an existing asset", () => {
  const root: LayoutNode = { tag: "img", attrs: { src: "missing.png" }, styles: {}, bounds: { x: 0, y: 0, w: 10, h: 10 }, children: [] };
  expect(inlineCapturedImages(root, "http://localhost/", new Map())).toHaveLength(1);
  expect(root.attrs["data-h2s-src"]).toBe("http://localhost/missing.png");
});

test("video poster embeds the image resource that Chrome loaded", () => {
  const root: LayoutNode = { tag: "video", attrs: { poster: "poster.png" }, styles: {}, bounds: { x: 0, y: 0, w: 80, h: 45 }, children: [] };
  const images = new Map([["http://localhost/assets/poster.png", "data:image/png;base64,AAAA"]]);
  expect(inlineCapturedImages(root, "http://localhost/assets/", images)).toEqual([]);
  expect(root.attrs.poster).toBe("data:image/png;base64,AAAA");
});

test("generated pseudo image uses the same captured resource embedding as img", () => {
  const root: LayoutNode = { tag: "::before", attrs: {}, styles: { content: 'url("icon.svg")' }, bounds: { x: 0, y: 0, w: 20, h: 20 }, children: [
    { tag: "img", attrs: { src: "icon.svg", alt: "" }, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 20, h: 20 }, children: [] },
  ] };
  const images = new Map([["http://localhost/assets/icon.svg", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="]]);
  expect(inlineCapturedImages(root, "http://localhost/assets/", images)).toEqual([]);
  expect(root.children[0]?.attrs["data-h2s-src"]).toBe("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
});
