import type { GeometryManifest } from "../../src/swift/geometry-observation.ts";
import type { ChromeGeometry, NativeGeometry } from "./geometry.ts";

export interface ScrollRangeComparison {
  required: boolean;
  compared: number;
  passed: boolean;
  staticViewports: string[];
  unavailable: string[];
  deltas: Array<{ sourceId: string; actual: { x: number; y: number }; expected: { x: number; y: number }; error: number }>;
}

/** App scrolling needs independently measured content extent as well as a matching viewport. */
export function compareScrollRanges(manifest: GeometryManifest, native: NativeGeometry, chrome: ChromeGeometry,
  mode: "app" | "fidelity", tolerance = 0.5): ScrollRangeComparison {
  const scrolls = chrome.elements.filter(element => element.rendered && element.scroll);
  const result: ScrollRangeComparison = { required: mode === "app", compared: 0, passed: true,
    staticViewports: [], unavailable: [], deltas: [] };
  for (const element of scrolls) {
    const id = element.sourceId ?? element.path;
    if (mode === "fidelity") { result.staticViewports.push(id); continue; }
    const content = manifest.nodes.filter(node => node.sourceId === element.sourceId && node.role === "scroll-content");
    const viewports = manifest.nodes.filter(node => node.sourceId === element.sourceId && node.role === "scroll-viewport");
    const body = content.length === 1 ? native.frames.find(frame => frame.key === content[0]!.key) : undefined;
    const viewport = viewports.length === 1 ? native.frames.find(frame => frame.key === viewports[0]!.key) : undefined;
    const scroll = element.scroll!;
    // Painted AABBs cannot prove a logical scroll size through transforms or border/gutter
    // insets. Leave these cases explicitly unavailable until native logical metrics exist.
    if (!body || !viewport || scroll.transformed || !element.frame
      || Math.abs(element.frame.w - scroll.viewportWidth) > tolerance
      || Math.abs(element.frame.h - scroll.viewportHeight) > tolerance) {
      result.unavailable.push(id); continue;
    }
    const actual = { x: Math.max(0, body.w - viewport.w), y: Math.max(0, body.h - viewport.h) };
    const expected = { x: Math.max(0, scroll.width - scroll.viewportWidth), y: Math.max(0, scroll.height - scroll.viewportHeight) };
    const error = Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y));
    result.deltas.push({ sourceId: id, actual, expected, error });
  }
  result.compared = result.deltas.length;
  result.passed = result.unavailable.length === 0 && result.deltas.every(delta => delta.error <= tolerance);
  return result;
}
