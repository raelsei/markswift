import { expect, test } from "bun:test";
import { compareScrollRanges } from "../../../tools/verify/corpus-scroll.ts";
import { compareGeometry, type NativeGeometry, type ChromeGeometry } from "../../../tools/verify/geometry.ts";
import type { GeometryManifest } from "../../../src/swift/geometry-observation.ts";

const manifest: GeometryManifest = { version: 1, namespace: "Scroll", nodes: [
  { key: "Scroll/content", sourceId: "#scroll", kind: "stack", relation: "root", role: "scroll-content", instrumented: true },
  { key: "Scroll/viewport", sourceId: "#scroll", kind: "stack", relation: "root", role: "scroll-viewport", instrumented: true },
] };
const native: NativeGeometry = { version: 1, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb",
  backend: "hosted", width: 390, height: 300, frames: [
    { key: "Scroll/content", role: "scroll-content", x: 0, y: 0, w: 390, h: 340 },
    { key: "Scroll/viewport", role: "scroll-viewport", x: 0, y: 0, w: 390, h: 300 },
  ] };
const chrome: ChromeGeometry = { version: 1, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb",
  width: 390, height: 300, elements: [{ sourceId: "#scroll", path: "", tag: "main", rendered: true,
    frame: { x: 0, y: 0, w: 390, h: 300 }, scroll: { width: 390, height: 340, viewportWidth: 390, viewportHeight: 300, left: 0, top: 0, transformed: false } }] };

test("a correct painted viewport cannot conceal a wrong actual native scrolling extent", () => {
  expect(compareScrollRanges(manifest, native, chrome, "app")).toMatchObject({ compared: 1, passed: true, deltas: [{ actual: { x: 0, y: 40 }, expected: { x: 0, y: 40 } }] });
  const wrong = structuredClone(native); wrong.frames[0]!.h = 900;
  expect(compareGeometry(manifest, wrong, chrome)).toMatchObject({ complete: true, matchingFrames: true, maxError: 0 });
  expect(compareScrollRanges(manifest, wrong, chrome, "app")).toMatchObject({ compared: 1, passed: false, deltas: [{ actual: { x: 0, y: 600 }, error: 560 }] });
  wrong.frames[0]!.h = 340; wrong.frames[0]!.w = 500;
  expect(compareScrollRanges(manifest, wrong, chrome, "app")).toMatchObject({ passed: false, deltas: [{ error: 110 }] });
});

test("missing, transformed and border-inset scroll metrics are explicitly unavailable", () => {
  const missing = { ...native, frames: [native.frames[1]!] };
  expect(compareScrollRanges(manifest, missing, chrome, "app")).toMatchObject({ passed: false, unavailable: ["#scroll"], compared: 0 });
  const transformed = structuredClone(chrome); transformed.elements[0]!.scroll!.transformed = true;
  expect(compareScrollRanges(manifest, native, transformed, "app")).toMatchObject({ passed: false, unavailable: ["#scroll"] });
  const inset = structuredClone(chrome); inset.elements[0]!.scroll!.viewportWidth -= 4;
  expect(compareScrollRanges(manifest, native, inset, "app")).toMatchObject({ passed: false, unavailable: ["#scroll"] });
});

test("fidelity records static clipped viewports without certifying native scrolling behavior", () => {
  const wrong = structuredClone(native); wrong.frames[0]!.h = 900;
  expect(compareScrollRanges(manifest, wrong, chrome, "fidelity")).toEqual({ required: false, compared: 0, passed: true,
    staticViewports: ["#scroll"], unavailable: [], deltas: [] });
});
