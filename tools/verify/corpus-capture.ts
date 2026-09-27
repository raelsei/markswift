import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserCapture, type Capture } from "../../src/browser/capture.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import { packageFonts } from "../../src/fonts/package.ts";
import { bundledFamilies, metricsForFonts } from "../../src/fonts/metadata.ts";
import type { CompileLayoutInput } from "../../src/compiler/batch.ts";
import type { CorpusFixture } from "./corpus-model.ts";
import { readChromeGeometry } from "./geometry-chrome.ts";
import type { ChromeGeometry } from "./geometry.ts";

export interface CorpusCaptureResult extends Capture { geometry: ChromeGeometry }

/** Reuse browser contexts by viewport; each case still gets a fresh page and original document. */
export class CorpusCapture {
  private browsers = new Map<number, BrowserCapture>();
  async capture(fixture: CorpusFixture, width: number, theme: "light" | "dark"): Promise<CorpusCaptureResult> {
    let browser = this.browsers.get(width);
    if (!browser) {
      browser = new BrowserCapture({ dpr: 2, viewport: { width, height: 1400 } });
      await browser.start(); this.browsers.set(width, browser);
    }
    let geometry: ChromeGeometry | undefined;
    const capture = await browser.capture({
      key: fixture.id, screen: fixture.id, theme, root: fixture.rootSelector, inlineImages: true,
      url: `http://markswift.local/corpus/${fixture.id}/${theme}/${width}`, html: fixture.html,
      prepare: async page => {
        await page.addStyleTag({ content: fixture.css });
      },
      observeSnapshot: async page => {
        // Live border observations do not use the converter's DOMSnapshot or inferred IR.
        geometry = await readChromeGeometry(page, fixture.rootSelector, htmlIdentity);
      },
    }, htmlIdentity, `corpus/${fixture.id}`);
    if (capture.layout.size.w !== width || capture.layout.size.h !== fixture.height) {
      throw new Error(`Fixture root must fill ${width}×${fixture.height}; measured ${capture.layout.size.w}×${capture.layout.size.h}`);
    }
    if (!geometry) throw new Error("Independent Chrome geometry was unavailable");
    return { ...capture, geometry };
  }
  async stop(): Promise<void> {
    const results = await Promise.allSettled([...this.browsers.values()].map(browser => browser.stop()));
    this.browsers.clear();
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}

/** A batch registers all resources from its actual captures; fonts cannot vanish in the harness. */
export async function corpusFonts(captures: readonly Capture[], work: string): Promise<Pick<CompileLayoutInput,
  "bundledFamilies" | "fontMetrics" | "supportFiles" | "assets"> & { warnings: string[] }> {
  await mkdir(join(work, "_fonts"), { recursive: true });
  for (const capture of captures) for (const font of capture.fontFiles) await writeFile(join(work, "_fonts", font.name), font.bytes);
  const faces = [...new Map(captures.flatMap(capture => capture.layout.fonts ?? []).map(face => [JSON.stringify(face), face])).values()];
  const fonts = await packageFonts(faces, join(work, "packaged"), work);
  const assets: Record<string, Uint8Array> = {};
  for (const face of fonts.faces) assets[`Fonts/${face.file}`] = new Uint8Array(await readFile(join(work, "packaged", "Fonts", face.file)));
  return {
    bundledFamilies: bundledFamilies(fonts), fontMetrics: metricsForFonts(fonts), assets,
    supportFiles: fonts.faces.length ? { "Font+Markswift.swift": fonts.swift, "UIAppFonts.plist.fragment": fonts.plist } : {},
    warnings: fonts.notes,
  };
}
