import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { BrowserCapture, type Capture } from "../../src/browser/capture.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { renderVisualSnapshots } from "./visual-native.ts";

const widths = [390, 320] as const;
const height = 480;
const dpr = 2;
const maxMeanRgbError = 8;
const fixture = "rich-text";
const out = join(import.meta.dir, "..", "..", "out", "visual-smoke");

async function captureAt(width: number, html: string, css: string): Promise<Capture> {
  const browser = new BrowserCapture({ dpr, viewport: { width, height: 1000 } });
  await browser.start();
  try {
    return await browser.capture({
      key: fixture,
      screen: fixture,
      theme: "light",
      url: `http://markswift.local/visual-smoke-${width}`,
      html,
      root: "[data-markswift-root]",
      prepare: async page => { await page.addStyleTag({ content: css }); },
    }, htmlIdentity, `visual-smoke/${fixture}`);
  } finally {
    await browser.stop();
  }
}

async function meanRgbError(reference: string, actual: string, width: number): Promise<number> {
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

async function main(): Promise<void> {
  const html = await Bun.file(new URL("./fixtures/rich-text.html", import.meta.url)).text();
  const css = await Bun.file(new URL("./fixtures/rich-text.css", import.meta.url)).text();
  await mkdir(out, { recursive: true });
  const captures = new Map<number, Capture>();
  for (const width of widths) {
    const capture = await captureAt(width, html, css);
    if (capture.layout.size.w !== width || capture.layout.size.h !== height) {
      throw new Error(`Chrome ${width}: unexpected root size ${capture.layout.size.w}×${capture.layout.size.h}`);
    }
    if (capture.fontFiles.length) throw new Error("Visual smoke fixture unexpectedly needs bundled fonts");
    captures.set(width, capture);
    await Bun.write(join(out, `${fixture}-${width}-chrome.png`), capture.png);
  }

  const regular = captures.get(390)!;
  const bundle = compileLayout(regular.layout, { name: "VisualSmokeRichText", mode: "app" });
  const outputs = Object.fromEntries(widths.map(width => [width, join(out, `${fixture}-${width}-ios.png`)])) as Record<number, string>;
  await renderVisualSnapshots(bundle, regular.layout, outputs, join(out, "native-work"));

  const failures: string[] = [];
  for (const width of widths) {
    const error = await meanRgbError(join(out, `${fixture}-${width}-chrome.png`), outputs[width]!, width);
    const result = `${fixture} ${width}: mean RGB error ${error.toFixed(2)} / ${maxMeanRgbError.toFixed(2)}`;
    console.log(result);
    if (error > maxMeanRgbError) failures.push(result);
  }
  console.log(`Images: ${out}`);
  if (failures.length) throw new Error(`Visual smoke exceeded its threshold:\n${failures.join("\n")}`);
}

await main();
