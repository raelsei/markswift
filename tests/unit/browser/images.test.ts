import { expect, test } from "bun:test";
import { inlineCapturedImages } from "../../../src/browser/images.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

test("image capture resolves selected picture candidate and CSS URLs against the document base", () => {
  const root: LayoutNode = {
    tag: "img",
    attrs: { src: "unused.png" },
    currentSrc: "selected.png",
    styles: { "background-image": 'url("back.png"), url("data:image/png;base64,xyz")' },
    bounds: { x: 0, y: 0, w: 10, h: 10 },
    children: [],
  };
  const images = new Map([
    ["http://localhost/assets/selected.png", "data:image/png;base64,a"],
    ["http://localhost/assets/back.png", "data:image/png;base64,b"],
  ]);
  expect(inlineCapturedImages(root, "http://localhost/assets/", images)).toEqual([]);
  expect(root.currentSrc).toBe("data:image/png;base64,a");
  expect(root.styles["background-image"]).toBe('url("data:image/png;base64,b"), url("data:image/png;base64,xyz")');
});

test("uncaptured images report an explicit warning rather than imply an existing asset", () => {
  const root: LayoutNode = {
    tag: "img",
    attrs: { src: "missing.png" },
    styles: {},
    bounds: { x: 0, y: 0, w: 10, h: 10 },
    children: [],
  };
  expect(inlineCapturedImages(root, "http://localhost/", new Map())).toHaveLength(1);
  expect(root.currentSrc).toBe("http://localhost/missing.png");
});

test("a video poster and an image button's src are inlined in place; other inputs keep their src", () => {
  const node = (tag: string, attrs: Record<string, string>): LayoutNode => ({
    tag,
    attrs,
    styles: {},
    bounds: { x: 0, y: 0, w: 10, h: 10 },
    children: [],
  });
  const video = node("video", { poster: "poster.png", src: "clip.mp4" });
  const button = node("input", { type: "image", src: "go.png" });
  const text = node("input", { type: "text", src: "go.png" });
  const root = { ...node("main", {}), children: [video, button, text] };
  const images = new Map([
    ["http://localhost/poster.png", "data:image/png;base64,p"],
    ["http://localhost/go.png", "data:image/png;base64,g"],
  ]);
  expect(inlineCapturedImages(root, "http://localhost/", images)).toEqual([]);
  expect(video.attrs).toEqual({ poster: "data:image/png;base64,p", src: "clip.mp4" });
  expect(button.attrs.src).toBe("data:image/png;base64,g");
  expect(text.attrs.src).toBe("go.png");
});
