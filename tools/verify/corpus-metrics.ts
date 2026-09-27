import sharp from "sharp";
import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";
import type { VisualRegion } from "./visual-fixtures.ts";
import { edgeComponents, spatialMetrics, type PixelRect, type SpatialMetrics } from "./pixel-metrics.ts";

interface AuditRegion extends VisualRegion { path?: number[] }

/** Preregistered strict appearance gates; failures remain in the denominator. */
export const corpusThresholds = Object.freeze({
  wholeRgb: 2, localRgb: 4, ssim: 0.99, edgePrecision: 0.98, edgeRecall: 0.98,
  changedFraction: 0.005, matchToleranceCss: 1,
});
export interface ComponentEvidence { bounds: PixelRect; metrics: SpatialMetrics; failures: string[] }
export interface RegionEvidence {
  label: string; metrics?: SpatialMetrics; failures: string[];
  components?: { total: number; failed: ComponentEvidence[] };
}
export interface AppearanceEvidence { whole: SpatialMetrics; regions: RegionEvidence[]; failures: string[] }

export async function compareCorpusImages(reference: string, native: string, layout: LayoutDoc,
  regions: readonly VisualRegion[], dpr = 2): Promise<AppearanceEvidence> {
  const load = (path: string) => sharp(path).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [first, second] = await Promise.all([load(reference), load(native)]);
  const dimensions = { width: layout.size.w * dpr, height: layout.size.h * dpr };
  for (const image of [first, second]) if (image.info.width !== dimensions.width || image.info.height !== dimensions.height) {
    throw new Error(`Expected ${dimensions.width}×${dimensions.height}, got ${image.info.width}×${image.info.height}`);
  }
  const whole = spatialMetrics({ ...dimensions, data: first.data }, { ...dimensions, data: second.data }, Math.ceil(dpr));
  const failures: string[] = [];
  if (whole.meanRgbError > corpusThresholds.wholeRgb) failures.push("whole RGB error");
  if (whole.localSsim < corpusThresholds.ssim) failures.push("whole local SSIM");
  const evidence: RegionEvidence[] = [];
  for (const region of [...regions, ...automaticRegions(layout.root)]) {
    const item: RegionEvidence = { label: region.label, failures: [] };
    evidence.push(item);
    const node = findRegion(layout.root, region);
    if (!node) { item.failures.push("expected region missing from capture"); continue; }
    const inset = region.inset ?? 0;
    const left = Math.floor((node.bounds.x - layout.root.bounds.x + inset) * dpr);
    const top = Math.floor((node.bounds.y - layout.root.bounds.y + inset) * dpr);
    const width = Math.ceil((node.bounds.w - 2 * inset) * dpr), height = Math.ceil((node.bounds.h - 2 * inset) * dpr);
    if (width <= 0 || height <= 0 || left < 0 || top < 0 || left + width > dimensions.width || top + height > dimensions.height) {
      item.failures.push("expected region empty or outside captured image"); continue;
    }
    const buffers = [first.data, second.data].map(data => crop(data, dimensions.width, left, top, width, height));
    const metrics = spatialMetrics({ data: buffers[0]!, width, height }, { data: buffers[1]!, width, height }, Math.ceil(dpr));
    item.metrics = metrics;
    item.failures.push(...localFailures(metrics));
    const rectangles = new Map<string, PixelRect>();
    for (const data of buffers) for (const rect of edgeComponents({ data, width, height })) rectangles.set(JSON.stringify(rect), rect);
    const failed: ComponentEvidence[] = [];
    for (const bounds of rectangles.values()) {
      const parts = buffers.map(data => crop(data, width, bounds.left, bounds.top, bounds.width, bounds.height));
      const component = spatialMetrics({ data: parts[0]!, width: bounds.width, height: bounds.height },
        { data: parts[1]!, width: bounds.width, height: bounds.height }, Math.ceil(dpr));
      const errors = localFailures(component);
      if (errors.length) failed.push({ bounds, metrics: component, failures: errors });
    }
    item.components = { total: rectangles.size, failed };
    if (failed.length) item.failures.push(`${failed.length} changed local features`);
  }
  if (!regions.length) failures.push("no declared critical regions");
  for (const region of evidence) failures.push(...region.failures.map(failure => `${region.label}: ${failure}`));
  return { whole, regions: evidence, failures };
}
function localFailures(metrics: SpatialMetrics): string[] {
  const failures: string[] = [];
  if (metrics.meanRgbError > corpusThresholds.localRgb) failures.push("local RGB error");
  if (metrics.localSsim < corpusThresholds.ssim || metrics.activeSsim < corpusThresholds.ssim) failures.push("local structure");
  if (metrics.referenceEdges > 0 && metrics.edgeRecall < corpusThresholds.edgeRecall) failures.push("missing or displaced edges");
  if (metrics.actualEdges > 0 && metrics.edgePrecision < corpusThresholds.edgePrecision) failures.push("extra or displaced edges");
  if (metrics.changedFraction > corpusThresholds.changedFraction) failures.push("changed region pixels");
  if (metrics.worstWindowRgbError > corpusThresholds.localRgb) failures.push("local window RGB error");
  if (metrics.worstWindowSsim < corpusThresholds.ssim) failures.push("local window structure");
  if (metrics.worstWindowChangedFraction > corpusThresholds.changedFraction) failures.push("changed local window pixels");
  return failures;
}

function findRegion(node: LayoutNode, region: AuditRegion): LayoutNode | undefined {
  if (region.path) {
    let current: LayoutNode | undefined = node;
    for (const index of region.path) current = current?.children[index];
    return current;
  }
  if (region.id ? node.attrs.id === region.id : node.tag === region.tag) return node;
  for (const child of node.children) { const found = findRegion(child, region); if (found) return found; }
}
/** Every visible text, control, image and independently painted group gets a local gate. */
function automaticRegions(root: LayoutNode): AuditRegion[] {
  const out: AuditRegion[] = [];
  const controls = new Set(["input", "textarea", "select", "button", "progress", "meter"]);
  const walk = (node: LayoutNode, path: number[], inheritedVisibility = "visible") => {
    if (node.styles.display === "none" || Number(node.styles.opacity ?? 1) === 0) return;
    const visibility = node.styles.visibility ?? inheritedVisibility;
    const visual = node.tag === "#text" && !!node.text?.trim() || controls.has(node.tag) || node.tag === "img" || node.tag === "svg"
      || node.styles["background-image"] !== undefined && node.styles["background-image"] !== "none"
      || paintedBackground(node.styles["background-color"])
      || ["top", "right", "bottom", "left"].some(side => parseFloat(node.styles[`border-${side}-width`] ?? "0") > 0
        && !["none", "hidden"].includes(node.styles[`border-${side}-style`] ?? "none"))
      || node.styles["box-shadow"] !== undefined && node.styles["box-shadow"] !== "none";
    if (visibility === "visible" && visual && node.bounds.w > 0 && node.bounds.h > 0) out.push({ path, label: `auto:${path.join("/")}:${node.tag}` });
    if (node.tag !== "svg") node.children.forEach((child, index) => walk(child, [...path, index], visibility));
  };
  walk(root, []);
  return out;
}
function paintedBackground(color?: string): boolean {
  if (!color || color === "transparent") return false;
  const alpha = color.match(/(?:rgba\([^)]*,|\/)([\d.]+)%?\s*\)$/)?.[1];
  return alpha === undefined || Number(alpha) > 0;
}
function crop(data: Uint8Array, stride: number, left: number, top: number, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * stride + left) * 4;
    out.set(data.subarray(start, start + width * 4), y * width * 4);
  }
  return out;
}
