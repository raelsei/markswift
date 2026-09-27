import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCorpusGeometry, verifyCorpusGeometry } from "../../../tools/verify/corpus-geometry.ts";
import type { GeometryManifest } from "../../../src/swift/geometry-observation.ts";
import type { ChromeGeometry, NativeGeometry } from "../../../tools/verify/geometry.ts";

const manifest: GeometryManifest = { version: 1, namespace: "Probe", nodes: [
  { key: "Probe/root", sourceId: "#root", kind: "box", relation: "root", role: "border", instrumented: true },
] };
const native: NativeGeometry = { version: 1, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb",
  backend: "hosted", width: 390, height: 300, frames: [{ key: "Probe/root", role: "border", x: 0, y: 0, w: 390, h: 300 }] };
const chrome: ChromeGeometry = { version: 1, coordinateSpace: "capture-viewport", frameKind: "painted-border-aabb",
  width: 390, height: 300, elements: [{ sourceId: "#root", path: "", tag: "main", rendered: true, frame: { x: 0, y: 0, w: 390, h: 300 } }] };

test("corpus geometry evidence retains actual inputs and detects changed native frames and forged reports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-corpus-geometry-"));
  try {
    const nativePath = join(directory, "native.json"), reference = join(directory, "chrome.json");
    await writeFile(nativePath, JSON.stringify(native)); await writeFile(reference, JSON.stringify(chrome));
    const saved = await saveCorpusGeometry(manifest, nativePath, reference, join(directory, "probe"));
    expect(saved.geometry.passed).toBe(true); expect(Object.keys(saved.artifactHashes)).toHaveLength(4);
    await verifyCorpusGeometry(saved.geometry);
    await expect(verifyCorpusGeometry(saved.geometry, { width: 320, height: 300, mode: "app" })).rejects.toThrow("different viewport");
    const shifted = structuredClone(native); shifted.frames[0]!.x = 2;
    await writeFile(nativePath, JSON.stringify(shifted));
    await expect(verifyCorpusGeometry(saved.geometry)).rejects.toThrow("disagrees");
    const failed = await saveCorpusGeometry(manifest, nativePath, reference, join(directory, "shifted"));
    expect(failed.geometry.passed).toBe(false); expect(failed.geometry.comparison.maxError).toBe(2);
    await expect(verifyCorpusGeometry({ ...failed.geometry, passed: true })).rejects.toThrow("disagrees");
    await expect(verifyCorpusGeometry({ ...failed.geometry, tolerance: 3 })).rejects.toThrow("tolerance changed");
    await expect(saveCorpusGeometry(manifest, nativePath, reference, join(directory, "probe"))).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("missing native or DOM coverage never becomes a geometry pass despite matching observed rectangles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-corpus-coverage-"));
  try {
    const nativePath = join(directory, "native.json"), reference = join(directory, "chrome.json");
    await writeFile(nativePath, JSON.stringify(native));
    const extra = structuredClone(chrome);
    extra.elements.push({ sourceId: "#lost", path: "0", tag: "span", rendered: true, frame: { x: 8, y: 8, w: 25, h: 16 } });
    await writeFile(reference, JSON.stringify(extra));
    const saved = await saveCorpusGeometry(manifest, nativePath, reference, join(directory, "probe"));
    expect(saved.geometry.comparison.matchingFrames).toBe(true);
    expect(saved.geometry.comparison.coverage.unmatchedDOM).toEqual(["0"]);
    expect(saved.geometry.passed).toBe(false);
    await verifyCorpusGeometry(saved.geometry);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
