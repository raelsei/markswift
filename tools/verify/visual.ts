import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { BrowserCapture, type Capture } from "../../src/browser/capture.ts";
import { compileLayout, compileResponsiveLayouts } from "../../src/compiler/index.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { loadVisualFixture, visualFixtures, type Theme, type VisualFixture } from "./visual-fixtures.ts";
import { meanRgbError, regionComparison } from "./visual-metrics.ts";
import { renderVisualSnapshots, type VisualSnapshot } from "./visual-native.ts";

const widths = [390, 320] as const;
const themes = ["light", "dark"] as const;
const dpr = 2;
const maxMeanRgbError = 8;
const out = join(import.meta.dir, "..", "..", "out", "visual-smoke");

async function captureAt(fixture: VisualFixture, width: number, theme: Theme, html: string, css: string): Promise<Capture> {
  const browser = new BrowserCapture({ dpr, viewport: { width, height: 1000 } });
  await browser.start();
  try {
    const capture = await browser.capture({
      key: fixture.id, screen: fixture.id, theme,
      url: `http://markswift.local/visual-smoke-${fixture.id}-${theme}-${width}`,
      html, root: "[data-markswift-root]",
      prepare: async page => { await page.addStyleTag({ content: css }); },
    }, htmlIdentity, `visual-smoke/${fixture.id}`);
    if (capture.layout.size.w !== width || capture.layout.size.h !== fixture.height) {
      throw new Error(`Chrome ${fixture.id} ${theme} ${width}: unexpected root size ${capture.layout.size.w}×${capture.layout.size.h}`);
    }
    if (capture.fontFiles.length) throw new Error(`Visual smoke fixture ${fixture.id} unexpectedly needs bundled fonts`);
    return capture;
  } finally {
    await browser.stop();
  }
}

async function checkSamples(path: string, fixture: VisualFixture, theme: Theme): Promise<void> {
  const image = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // This corner must change between themes; a repeated light capture cannot pass as dark.
  const samples = [{ x: 1, y: 1, rgb: fixture.background[theme] }, ...fixture.samples ?? []];
  for (const sample of samples) {
    const offset = ((sample.y * dpr) * image.info.width + sample.x * dpr) * 4;
    const actual = [...image.data.subarray(offset, offset + 3)];
    if (sample.rgb.some((expected, channel) => Math.abs(expected - actual[channel]!) > 16)) {
      throw new Error(`pixel (${sample.x}, ${sample.y}): expected ${sample.rgb}, got ${actual}`);
    }
  }
}

function firstTag(node: LayoutNode, tag: string): LayoutNode | undefined {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = firstTag(child, tag);
    if (found) return found;
  }
  return undefined;
}

/** A full-page mean can hide a missing heading in a large flat background. */
async function checkHeading(browserPath: string, nativePath: string, capture: Capture, fixture: VisualFixture, label: string): Promise<void> {
  const root = capture.layout.root;
  const heading = firstTag(root, "h1");
  if (!heading) throw new Error("captured h1 is missing");
  const region = {
    left: Math.floor((heading.bounds.x - root.bounds.x) * dpr),
    top: Math.floor((heading.bounds.y - root.bounds.y) * dpr),
    width: Math.ceil(heading.bounds.w * dpr),
    height: Math.ceil(heading.bounds.h * dpr),
  };
  const [browser, native] = await Promise.all([
    sharp(browserPath).extract(region).ensureAlpha().raw().toBuffer(),
    sharp(nativePath).extract(region).ensureAlpha().raw().toBuffer(),
  ]);
  const metrics = regionComparison(browser, native, fixture.background[capture.layout.combo.theme]);
  console.log(`${label} heading: RGB error ${metrics.meanRgbError.toFixed(2)} / 32.00; foreground retention ${metrics.foregroundRetention.toFixed(2)} / 0.70`);
  if (metrics.meanRgbError > 32 || metrics.foregroundRetention < 0.7) throw new Error("main heading differs or is missing");
}

function snapshotsFor(fixture: VisualFixture, theme: Theme, captures: Map<number, Capture>): VisualSnapshot[] {
  const regular = captures.get(390)!;
  const name = `${fixture.name}App`;
  const app = fixture.responsive
    ? compileResponsiveLayouts({
      name, breakpoint: 350, mode: "app",
      compact: { layout: captures.get(320)!.layout, viewportWidth: 320 },
      regular: { layout: regular.layout, viewportWidth: 390 },
    })
    : compileLayout(regular.layout, { name, mode: "app" });
  const output = (mode: string, width: number) => join(out, `${fixture.id}-${theme}-${mode}-${width}-ios.png`);
  return [
    { bundle: app, layout: regular.layout, outputs: Object.fromEntries(widths.map(width => [width, output("app", width)])) },
    // Fidelity freezes measured geometry: each snapshot uses its own captured width.
    ...widths.map(width => ({
      bundle: compileLayout(captures.get(width)!.layout, { name: `${fixture.name}Fidelity${width}`, mode: "fidelity" }),
      layout: captures.get(width)!.layout, outputs: { [width]: output("fidelity", width) },
    })),
  ];
}

async function main(): Promise<void> {
  await mkdir(out, { recursive: true });
  const failures: string[] = [];
  let compared = 0;
  for (const fixture of visualFixtures) {
    const { html, css } = await loadVisualFixture(fixture);
    for (const theme of themes) {
      const captures = new Map<number, Capture>();
      const browserPath = (width: number) => join(out, `${fixture.id}-${theme}-${width}-chrome.png`);
      for (const width of widths) {
        const capture = await captureAt(fixture, width, theme, html, css);
        captures.set(width, capture);
        await Bun.write(browserPath(width), capture.png);
      }
      const snapshots = snapshotsFor(fixture, theme, captures);
      await renderVisualSnapshots(snapshots, join(out, "native-work"));
      for (const [index, snapshot] of snapshots.entries()) for (const [widthString, nativePath] of Object.entries(snapshot.outputs)) {
        const width = Number(widthString);
        const label = `${fixture.id} ${theme} ${index === 0 ? "app" : "fidelity"} ${width}`;
        try {
          const error = await meanRgbError(browserPath(width), nativePath, width, fixture.height, dpr);
          console.log(`${label}: mean RGB error ${error.toFixed(2)} / ${maxMeanRgbError.toFixed(2)}`);
          if (error > maxMeanRgbError) throw new Error("mean RGB error exceeded threshold");
          await checkSamples(browserPath(width), fixture, theme);
          await checkSamples(nativePath, fixture, theme);
          if (fixture.id !== "image-position") await checkHeading(browserPath(width), nativePath, captures.get(width)!, fixture, label);
        } catch (error) {
          failures.push(`${label}: ${error instanceof Error ? error.message : error}`);
        }
        compared++;
      }
    }
  }
  console.log(`${compared} comparisons; images: ${out}`);
  if (failures.length) throw new Error(`Visual smoke failed:\n${failures.join("\n")}`);
}

await main();
