import { expect, test } from "bun:test";
import { compareGeometry, parseNativeGeometry, type ChromeGeometry, type NativeGeometry } from "../../../tools/verify/geometry.ts";
import type { GeometryManifest } from "../../../src/swift/geometry-observation.ts";
import { nativeSnapshotTestSource, type VisualSnapshot } from "../../../tools/verify/visual-native.ts";
import { planNativeModules } from "../../../tools/verify/native-modules.ts";
import { quadBounds } from "../../../tools/verify/geometry-cdp.ts";

const manifest: GeometryManifest = { version: 1, namespace: "Probe", nodes: [{ key: "Probe/root", sourceId: "#root", kind: "box", relation: "root", role: "border", instrumented: true }] };
const actual: NativeGeometry = { version: 1, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb", backend: "hosted", width: 320, height: 200,
  frames: [{ key: "Probe/root", role: "border", x: 0, y: 0, w: 320, h: 200 }] };
const chrome: ChromeGeometry = { version: 1, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb", width: 320, height: 200,
  elements: [{ sourceId: "#root", path: "", tag: "main", rendered: true, frame: { x: 0, y: 0, w: 320, h: 200 } }] };

test("actual frame differences are detected without filling observations from expected rectangles", () => {
  expect(compareGeometry(manifest, actual, chrome)).toMatchObject({ compared: 1, matchingFrames: true, complete: true, maxError: 0 });
  for (const field of ["x", "y", "w", "h"] as const) {
    const changed = structuredClone(actual); changed.frames[0]![field] += 7;
    expect(compareGeometry(manifest, changed, chrome)).toMatchObject({ compared: 1, matchingFrames: false, maxError: 7 });
    expect(changed.frames[0]![field]).toBe(actual.frames[0]![field] + 7);
  }
  expect(() => parseNativeGeometry({ ...actual, frames: [] })).toThrow("unavailable");
  expect(() => parseNativeGeometry({ ...actual, frames: [...actual.frames, ...actual.frames] })).toThrow("Duplicate");
  expect(() => compareGeometry(manifest, actual, { ...chrome, width: 390 })).toThrow("mismatch");
});

test("missing, ambiguous, synthetic, boxless and scroll-content coverage are distinct", () => {
  const extended = structuredClone(manifest);
  extended.nodes.push({ ...extended.nodes[0]!, key: "Probe/synthetic", sourceId: "#root#text", kind: "text" },
    { ...extended.nodes[0]!, key: "Probe/not-emitted", sourceId: "#label", instrumented: false },
    { ...extended.nodes[0]!, key: "Probe/content", role: "scroll-content" });
  const comparison = compareGeometry(extended, actual, { ...chrome, elements: [...chrome.elements,
    { sourceId: "#extra", path: "0", tag: "span", rendered: true, frame: { x: 20, y: 20, w: 10, h: 10 } },
    { sourceId: "#contents", path: "1", tag: "div", rendered: false }] });
  expect(comparison.complete).toBe(false);
  expect(comparison.coverage).toEqual({ missingNative: ["Probe/synthetic", "Probe/content"], notInstrumented: ["Probe/not-emitted"],
    unmatchedSemantic: ["Probe/synthetic", "Probe/not-emitted"], unmatchedDOM: ["0"], ambiguousSourceIds: [], contentObservations: ["Probe/content"], boxlessDOM: ["1"], unpaintedDOM: [], unavailableBrowser: [] });
  const duplicate = { ...manifest, nodes: [...manifest.nodes, { ...manifest.nodes[0]!, key: "Probe/other" }] };
  expect(compareGeometry(duplicate, actual, chrome)).toMatchObject({ compared: 0, matchingFrames: false, complete: false, maxError: null, coverage: { ambiguousSourceIds: ["#root"] } });
  expect(() => compareGeometry(manifest, { ...actual, frames: [{ ...actual.frames[0]!, key: "Unknown/root" }] }, chrome)).toThrow("Unexpected");
});

test("unavailable browser observations cannot turn exact native frames into complete coverage", () => {
  const missing = [{ path: "::before", reason: "Actual CDP pseudo border unavailable" }];
  const comparison = compareGeometry(manifest, actual, { ...chrome, unavailableObservations: missing, elements: [...chrome.elements,
    { sourceId: "#closed", path: "0", tag: "article", rendered: false, visibility: "unpainted" }] });
  expect(comparison.matchingFrames).toBe(true);
  expect(comparison.complete).toBe(false);
  expect(comparison.coverage.unavailableBrowser).toEqual(missing);
  expect(comparison.coverage.unpaintedDOM).toEqual(["0"]);
  expect(comparison.coverage.boxlessDOM).toEqual([]);
});

test("actual transformed viewport border quads rebase to the observed root origin", () => {
  expect(quadBounds([40, 30, 40, 50, 30, 50, 30, 30], { x: 20, y: 10 })).toEqual({ x: 10, y: 20, w: 10, h: 20 });
  expect(() => quadBounds([0, 0, 1], { x: 0, y: 0 })).toThrow("Invalid CDP");
  expect(() => quadBounds([0, 0, 1, 0, 1, NaN, 0, 1], { x: 0, y: 0 })).toThrow("Invalid CDP");
});

test("native harness only wraps opted-in jobs and fails unavailable geometry", () => {
  const layout: VisualSnapshot["layout"] = { version: 1, source: "test", combo: { screen: "test", theme: "light", demoState: "normal" }, size: { w: 320, h: 200 }, dpr: 1, canvas: "rgb(255, 255, 255)",
    root: { tag: "main", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 320, h: 200 }, children: [] } };
  const plain: VisualSnapshot = { bundle: { name: "Probe", files: {} }, layout, outputs: { 320: "/tmp/probe.png" } };
  const plan = planNativeModules([plain]);
  const baseline = nativeSnapshotTestSource([plain], plan.modules, plan.snapshotModules);
  expect(nativeSnapshotTestSource([{ ...plain, geometryOutputs: {} }], plan.modules, plan.snapshotModules)).toBe(baseline);
  expect(baseline).not.toContain("GeometryCollector");
  expect(() => nativeSnapshotTestSource([{ ...plain, geometryOutputs: { 320: "/tmp/probe.json" } }], plan.modules, plan.snapshotModules)).toThrow("instrumented");
  const observed = { ...plain, bundle: { ...plain.bundle, files: { "MarkswiftGeometry.swift": "runtime" } }, geometryOutputs: { 320: "/tmp/probe.json" } };
  const source = nativeSnapshotTestSource([observed], plan.modules, plan.snapshotModules);
  expect(source).toContain("MarkswiftGeometryReader(content: Generated0.Probe(), collector: geometry0_0)");
  expect(source).toContain('"Actual native geometry was unavailable"');
  expect(source).toContain('backend: "image-renderer", width: 320, height: 200');
  expect(source).not.toContain('"x":');
});
