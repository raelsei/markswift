import sharp from "sharp";
import type { Capture } from "../../src/browser/capture.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import type { Theme, VisualFixture, VisualRegion } from "./visual-fixtures.ts";
import { meanRgbError, regionComparison } from "./visual-metrics.ts";

async function checkSamples(path: string, fixture: VisualFixture, theme: Theme, dpr: number): Promise<void> {
  const image = await sharp(path).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const samples = [{ x: 1, y: 1, rgb: fixture.background[theme] }, ...fixture.samples ?? []];
  for (const sample of samples) {
    const expected = Array.isArray(sample.rgb) ? sample.rgb : sample.rgb[theme];
    const offset = ((sample.y * dpr) * image.info.width + sample.x * dpr) * 4;
    const actual = [...image.data.subarray(offset, offset + 3)];
    if (expected.some((channel, index) => Math.abs(channel - actual[index]!) > 16)) {
      throw new Error(`pixel (${sample.x}, ${sample.y}): expected ${expected}, got ${actual}`);
    }
  }
}

function regionNode(node: LayoutNode, region: VisualRegion): LayoutNode | undefined {
  if (region.id ? node.attrs.id === region.id : node.tag === region.tag) return node;
  for (const child of node.children) {
    const found = regionNode(child, region);
    if (found) return found;
  }
  return undefined;
}

/** Region guards keep a small missing feature from hiding in a whole-page mean. */
async function checkRegion(browserPath: string, nativePath: string, capture: Capture, fixture: VisualFixture, region: VisualRegion, label: string, dpr: number): Promise<void> {
  const root = capture.layout.root;
  const node = regionNode(root, region);
  if (!node) throw new Error(`captured ${region.label} is missing`);
  const inset = region.inset ?? 0;
  const bounds = {
    left: Math.floor((node.bounds.x - root.bounds.x + inset) * dpr),
    top: Math.floor((node.bounds.y - root.bounds.y + inset) * dpr),
    width: Math.ceil((node.bounds.w - 2 * inset) * dpr),
    height: Math.ceil((node.bounds.h - 2 * inset) * dpr),
  };
  const [browser, native] = await Promise.all([
    sharp(browserPath).extract(bounds).toColourspace("srgb").ensureAlpha().raw().toBuffer(),
    sharp(nativePath).extract(bounds).toColourspace("srgb").ensureAlpha().raw().toBuffer(),
  ]);
  const metrics = regionComparison(browser, native, (region.background ?? fixture.background)[capture.layout.combo.theme]);
  const maxError = region.maxError ?? 32, minForeground = region.minForeground ?? 0.7;
  console.log(`${label} ${region.label}: RGB error ${metrics.meanRgbError.toFixed(2)} / ${maxError.toFixed(2)}; foreground retention ${metrics.foregroundRetention.toFixed(2)} / ${minForeground.toFixed(2)}`);
  if (metrics.meanRgbError > maxError || metrics.foregroundRetention < minForeground) {
    throw new Error(`${region.label} differs or is missing`);
  }
}

export async function compareVisualCapture(browserPath: string, nativePath: string, capture: Capture, fixture: VisualFixture, label: string, dpr: number): Promise<void> {
  const maxError = 8;
  const error = await meanRgbError(browserPath, nativePath, capture.layout.size.w, fixture.height, dpr);
  console.log(`${label}: mean RGB error ${error.toFixed(2)} / ${maxError.toFixed(2)}`);
  if (error > maxError) throw new Error("mean RGB error exceeded threshold");
  await checkSamples(browserPath, fixture, capture.layout.combo.theme, dpr);
  await checkSamples(nativePath, fixture, capture.layout.combo.theme, dpr);
  const regions: VisualRegion[] = fixture.id === "image-position" ? [] : [{ tag: "h1", label: "heading" }];
  for (const region of [...regions, ...fixture.regions ?? []]) {
    await checkRegion(browserPath, nativePath, capture, fixture, region, label, dpr);
  }
}
