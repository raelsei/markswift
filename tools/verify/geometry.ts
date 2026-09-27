import type { GeometryManifest, GeometryManifestNode } from "../../src/swift/geometry-observation.ts";

export interface GeometryRect { x: number; y: number; w: number; h: number }
export interface NativeGeometryFrame extends GeometryRect { key: string; role: GeometryManifestNode["role"] }
export interface NativeGeometry {
  version: 1;
  coordinateSpace: "capture-viewport";
  frameKind: "painted-border-aabb";
  backend: "hosted" | "image-renderer";
  width: number;
  height: number;
  frames: NativeGeometryFrame[];
}
export interface ChromeGeometryElement {
  sourceId?: string;
  path: string;
  tag: string;
  rendered: boolean;
  /** A box can exist while the browser suppresses its paint, including closed details. */
  visibility?: "boxless" | "unpainted";
  observation?: "element-border" | "pseudo-border";
  frame?: GeometryRect;
  /** Logical scroll metrics are independent of painted AABBs; transformed ranges are not compared. */
  scroll?: { width: number; height: number; viewportWidth: number; viewportHeight: number; left: number; top: number; transformed: boolean };
}
export interface ChromeGeometry {
  version: 1;
  coordinateSpace: "capture-viewport";
  frameKind: "painted-border-aabb";
  width: number;
  height: number;
  elements: ChromeGeometryElement[];
  /** Protocol/visibility failures are evidence gaps, never synthesized rectangles. */
  unavailableObservations?: Array<{ path: string; reason: string }>;
}
export interface GeometryComparison {
  compared: number;
  matchingFrames: boolean;
  complete: boolean;
  maxError: number | null;
  deltas: Array<{ key: string; sourceId: string; actual: GeometryRect; expected: GeometryRect; error: number }>;
  coverage: {
    missingNative: string[];
    notInstrumented: string[];
    unmatchedSemantic: string[];
    unmatchedDOM: string[];
    ambiguousSourceIds: string[];
    contentObservations: string[];
    boxlessDOM: string[];
    unpaintedDOM: string[];
    unavailableBrowser: Array<{ path: string; reason: string }>;
  };
}

function validRect(rect: GeometryRect): boolean {
  return [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w >= 0 && rect.h >= 0;
}

/** Accept only actual collector output. No expected/captured coordinates are accepted here. */
export function parseNativeGeometry(input: unknown): NativeGeometry {
  const data = input as Partial<NativeGeometry> | null;
  if (!data || data.version !== 1 || data.coordinateSpace !== "capture-viewport" || data.frameKind !== "painted-border-aabb"
    || !["hosted", "image-renderer"].includes(data.backend ?? "") || !Number.isFinite(data.width) || !Number.isFinite(data.height) || data.width! <= 0 || data.height! <= 0
    || !Array.isArray(data.frames)) throw new Error("Invalid native geometry contract");
  const keys = new Set<string>();
  for (const frame of data.frames) {
    if (!frame || typeof frame.key !== "string" || !["border", "scroll-content", "scroll-viewport"].includes(frame.role) || !validRect(frame)) {
      throw new Error("Invalid native geometry observation");
    }
    if (keys.has(frame.key)) throw new Error(`Duplicate native geometry key: ${frame.key}`);
    keys.add(frame.key);
  }
  if (!data.frames.length) throw new Error("Actual native geometry was unavailable");
  return data as NativeGeometry;
}

/** Compare independently observed native rectangles with a separately laid-out Chrome page. */
export function compareGeometry(manifest: GeometryManifest, nativeInput: unknown, chrome: ChromeGeometry, tolerance = 0.5): GeometryComparison {
  const native = parseNativeGeometry(nativeInput);
  if (chrome.version !== 1 || chrome.coordinateSpace !== native.coordinateSpace || chrome.frameKind !== native.frameKind
    || chrome.width !== native.width || chrome.height !== native.height || !Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("Geometry viewport or coordinate contract mismatch");
  }
  const coverage: GeometryComparison["coverage"] = { missingNative: [], notInstrumented: [], unmatchedSemantic: [], unmatchedDOM: [], ambiguousSourceIds: [], contentObservations: [], boxlessDOM: [], unpaintedDOM: [], unavailableBrowser: chrome.unavailableObservations ?? [] };
  const actual = new Map(native.frames.map(frame => [frame.key, frame]));
  const manifestKeys = new Map(manifest.nodes.map(node => [node.key, node]));
  if (manifestKeys.size !== manifest.nodes.length) throw new Error("Duplicate manifest geometry key");
  for (const frame of native.frames) {
    const entry = manifestKeys.get(frame.key);
    if (!entry || entry.role !== frame.role || !entry.instrumented) throw new Error(`Unexpected native observation: ${frame.key}`);
  }
  const semantic = new Map<string, GeometryManifestNode[]>(), dom = new Map<string, ChromeGeometryElement[]>();
  for (const node of manifest.nodes) {
    if (!node.instrumented) coverage.notInstrumented.push(node.key);
    else if (!actual.has(node.key)) coverage.missingNative.push(node.key);
    if (node.role === "scroll-content") { coverage.contentObservations.push(node.key); continue; }
    const entries = semantic.get(node.sourceId) ?? []; entries.push(node); semantic.set(node.sourceId, entries);
  }
  for (const element of chrome.elements) {
    if (!element.rendered) { (element.visibility === "unpainted" ? coverage.unpaintedDOM : coverage.boxlessDOM).push(element.path); continue; }
    if (!element.frame || !validRect(element.frame)) throw new Error(`Invalid Chrome geometry observation: ${element.path}`);
    if (!element.sourceId) { coverage.unmatchedDOM.push(element.path); continue; }
    const entries = dom.get(element.sourceId) ?? []; entries.push(element); dom.set(element.sourceId, entries);
  }
  const deltas: GeometryComparison["deltas"] = [];
  for (const sourceId of new Set([...semantic.keys(), ...dom.keys()])) {
    const nodes = semantic.get(sourceId) ?? [], elements = dom.get(sourceId) ?? [];
    if (nodes.length > 1 || elements.length > 1) { coverage.ambiguousSourceIds.push(sourceId); continue; }
    const node = nodes[0], element = elements[0];
    if (!node) { coverage.unmatchedDOM.push(element!.path); continue; }
    if (!element) { coverage.unmatchedSemantic.push(node.key); continue; }
    const frame = actual.get(node.key);
    if (!frame) continue;
    const expected = element.frame!;
    const rectangle = { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
    const error = Math.max(...(["x", "y", "w", "h"] as const).map(axis => Math.abs(frame[axis] - expected[axis])));
    deltas.push({ key: node.key, sourceId, actual: rectangle, expected, error });
  }
  return {
    compared: deltas.length, matchingFrames: deltas.length > 0 && deltas.every(delta => delta.error <= tolerance),
    complete: coverage.missingNative.length + coverage.notInstrumented.length + coverage.unmatchedSemantic.length + coverage.unmatchedDOM.length + coverage.ambiguousSourceIds.length + coverage.unavailableBrowser.length === 0,
    maxError: deltas.length ? Math.max(...deltas.map(delta => delta.error)) : null, deltas, coverage,
  };
}
