import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { BrowserCapture, type Capture } from "../../src/browser/capture.ts";
import { compileLayout, compileResponsiveLayouts } from "../../src/compiler/index.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import { renderVisualSnapshots } from "./visual-native.ts";

const widths = [390, 320] as const;
const dpr = 2;
const maxMeanRgbError = 8;
const out = join(import.meta.dir, "..", "..", "out", "visual-smoke");

interface Fixture {
  id: string;
  height: number;
  name: string;
  responsive: boolean;
  samples?: Array<{ x: number; y: number; rgb: [number, number, number] }>;
}

const fixtures: Fixture[] = [
  { id: "rich-text", height: 480, name: "VisualSmokeRichText", responsive: false },
  { id: "full-page", height: 650, name: "VisualSmokeFullPage", responsive: true },
  { id: "image-position", height: 255, name: "VisualSmokeImagePosition", responsive: false, samples: [
    { x: 42, y: 42, rgb: [255, 0, 0] },
    { x: 127, y: 42, rgb: [0, 0, 255] },
    { x: 42, y: 127, rgb: [0, 255, 0] },
    { x: 127, y: 127, rgb: [255, 255, 0] },
    { x: 42, y: 212, rgb: [255, 0, 0] },
    { x: 127, y: 212, rgb: [0, 0, 255] },
  ] },
];

async function stripedImage(width: number, height: number, vertical: boolean, near: [number, number, number], far: [number, number, number], format: "png" | "jpeg" = "png"): Promise<string> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = (vertical ? y < height / 2 : x < width / 2) ? near : far;
    const offset = (y * width + x) * 3;
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = color[channel]!;
  }
  const source = sharp(pixels, { raw: { width, height, channels: 3 } });
  const bytes = await (format === "jpeg" ? source.jpeg({ quality: 100 }).withMetadata({ orientation: 6 }) : source.png()).toBuffer();
  return `data:image/${format};base64,${bytes.toString("base64")}`;
}

async function fixtureHtml(fixture: Fixture): Promise<string> {
  const html = await Bun.file(new URL(`./fixtures/${fixture.id}.html`, import.meta.url)).text();
  if (fixture.id !== "image-position") return html;
  const horizontal = await stripedImage(80, 40, false, [255, 0, 0], [0, 0, 255]);
  const vertical = await stripedImage(40, 80, true, [0, 255, 0], [255, 255, 0]);
  const exif = await stripedImage(80, 40, false, [255, 0, 0], [0, 0, 255], "jpeg");
  return html.replaceAll("__MARKSWIFT_HORIZONTAL_URL__", horizontal)
    .replaceAll("__MARKSWIFT_VERTICAL_URL__", vertical)
    .replaceAll("__MARKSWIFT_EXIF_URL__", exif);
}

async function captureAt(fixture: Fixture, width: number, html: string, css: string): Promise<Capture> {
  const browser = new BrowserCapture({ dpr, viewport: { width, height: 1000 } });
  await browser.start();
  try {
    return await browser.capture({
      key: fixture.id,
      screen: fixture.id,
      theme: "light",
      url: `http://markswift.local/visual-smoke-${fixture.id}-${width}`,
      html,
      root: "[data-markswift-root]",
      prepare: async page => { await page.addStyleTag({ content: css }); },
    }, htmlIdentity, `visual-smoke/${fixture.id}`);
  } finally {
    await browser.stop();
  }
}

async function meanRgbError(reference: string, actual: string, width: number, height: number): Promise<number> {
  const [browser, native] = await Promise.all([
    sharp(reference).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(actual).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const expected = { width: width * dpr, height: height * dpr };
  for (const [kind, image] of [["Chrome", browser], ["iOS", native]] as const) {
    if (image.info.width !== expected.width || image.info.height !== expected.height) {
      throw new Error(`${kind} ${width}: expected ${expected.width}×${expected.height} px, got ${image.info.width}×${image.info.height}`);
    }
  }
  let total = 0;
  for (let offset = 0; offset < browser.data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      total += Math.abs(browser.data[offset + channel]! - native.data[offset + channel]!);
    }
  }
  return total / (expected.width * expected.height * 3);
}

async function checkSamples(path: string, fixture: Fixture, width: number, source: string): Promise<void> {
  if (!fixture.samples) return;
  const image = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const sample of fixture.samples) {
    const offset = ((sample.y * dpr) * image.info.width + sample.x * dpr) * 4;
    const actual = [...image.data.subarray(offset, offset + 3)];
    if (sample.rgb.some((expected, channel) => Math.abs(expected - actual[channel]!) > 16)) {
      throw new Error(`${fixture.id} ${width} ${source} pixel (${sample.x}, ${sample.y}): expected ${sample.rgb}, got ${actual}`);
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
async function checkHeading(browserPath: string, nativePath: string, capture: Capture, width: number): Promise<void> {
  const root = capture.layout.root;
  const heading = firstTag(root, "h1");
  if (!heading) throw new Error(`full-page ${width}: captured h1 is missing`);
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
  let rgbError = 0, browserDark = 0, nativeDark = 0;
  for (let offset = 0; offset < browser.length; offset += 4) {
    let referenceDark = true, renderedDark = true;
    for (let channel = 0; channel < 3; channel++) {
      const expected = browser[offset + channel]!, actual = native[offset + channel]!;
      rgbError += Math.abs(expected - actual);
      if (expected >= 90) referenceDark = false;
      if (actual >= 90) renderedDark = false;
    }
    if (referenceDark) browserDark++;
    if (renderedDark) nativeDark++;
  }
  const mean = rgbError / (region.width * region.height * 3);
  const retained = browserDark ? nativeDark / browserDark : 0;
  console.log(`full-page ${width} heading: RGB error ${mean.toFixed(2)} / 32.00; dark-pixel retention ${retained.toFixed(2)} / 0.70`);
  if (mean > 32 || retained < 0.7) throw new Error(`full-page ${width}: main heading differs or is missing`);
}

async function main(): Promise<void> {
  await mkdir(out, { recursive: true });
  const failures: string[] = [];
  for (const fixture of fixtures) {
    const html = await fixtureHtml(fixture);
    const css = await Bun.file(new URL(`./fixtures/${fixture.id}.css`, import.meta.url)).text();
    const captures = new Map<number, Capture>();
    for (const width of widths) {
      const capture = await captureAt(fixture, width, html, css);
      if (capture.layout.size.w !== width || capture.layout.size.h !== fixture.height) {
        throw new Error(`Chrome ${fixture.id} ${width}: unexpected root size ${capture.layout.size.w}×${capture.layout.size.h}`);
      }
      if (capture.fontFiles.length) throw new Error(`Visual smoke fixture ${fixture.id} unexpectedly needs bundled fonts`);
      captures.set(width, capture);
      await Bun.write(join(out, `${fixture.id}-${width}-chrome.png`), capture.png);
    }

    const regular = captures.get(390)!;
    const bundle = fixture.responsive
      ? compileResponsiveLayouts({
        name: fixture.name, breakpoint: 350, mode: "app",
        compact: { layout: captures.get(320)!.layout, viewportWidth: 320 },
        regular: { layout: regular.layout, viewportWidth: 390 },
      })
      : compileLayout(regular.layout, { name: fixture.name, mode: "app" });
    const outputs = Object.fromEntries(widths.map(width => [width, join(out, `${fixture.id}-${width}-ios.png`)])) as Record<number, string>;
    await renderVisualSnapshots(bundle, regular.layout, outputs, join(out, "native-work"));

    for (const width of widths) {
      const browserPath = join(out, `${fixture.id}-${width}-chrome.png`);
      const error = await meanRgbError(browserPath, outputs[width]!, width, fixture.height);
      const result = `${fixture.id} ${width}: mean RGB error ${error.toFixed(2)} / ${maxMeanRgbError.toFixed(2)}`;
      console.log(result);
      if (error > maxMeanRgbError) failures.push(result);
      await checkSamples(browserPath, fixture, width, "Chrome");
      await checkSamples(outputs[width]!, fixture, width, "iOS");
      if (fixture.id === "full-page") await checkHeading(browserPath, outputs[width]!, captures.get(width)!, width);
    }
  }
  console.log(`Images: ${out}`);
  if (failures.length) throw new Error(`Visual smoke exceeded its threshold:\n${failures.join("\n")}`);
}

await main();
