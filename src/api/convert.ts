import { DEFAULT_ROOT } from "../input/root.ts";
import { validateName } from "../compiler/naming.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserCapture } from "../browser/capture.ts";
import { resolveSource, type ResolvedSource } from "../input/source.ts";
import { compileLayout } from "../compiler/index.ts";
import { packageFonts } from "../fonts/package.ts";
import { bundledFamilies, metricsForFonts } from "../fonts/metadata.ts";
import { htmlIdentity } from "../input/identity.ts";
import type { HtmlSource } from "../input/types.ts";
import type { ConvertOptions, ConversionResult } from "./types.ts";

/** Convert a document, fragment, HTML file or rendered URL through the same measured pipeline. */
export async function convert(source: HtmlSource, options: ConvertOptions = {}): Promise<ConversionResult> {
  validateName(options.name ?? "ConvertedView");
  const viewport = options.viewport ?? { width: 390, height: 844 };
  const dpr = options.dpr ?? 1;
  if (![viewport.width, viewport.height].every((n) => Number.isInteger(n) && n > 0) || !Number.isFinite(dpr) || dpr <= 0) {
    throw new Error("viewport dimensions must be positive integers and dpr must be positive and finite");
  }
  if (["html", "file", "url"].filter((key) => key in source).length !== 1) throw new Error("provide exactly one of html, file or url");
  if (options.untrustedInput && (!("html" in source) || source.assetsDir || source.baseURL)) {
    throw new Error("untrustedInput accepts pasted HTML without assetsDir or baseURL only");
  }
  const work = await mkdtemp(join(tmpdir(), "markswift-"));
  let prepared: ResolvedSource | undefined;
  const renderer = new BrowserCapture({ viewport, dpr, channel: options.browserChannel, restricted: options.untrustedInput });
  try {
    prepared = await resolveSource(source);
    const { html, url, label } = prepared;
    await renderer.start();
    const name = options.name ?? "ConvertedView";
    const theme = options.theme ?? "light";
    // :has is resolved by Chromium. A fragment and a full document use identical root rules.
    const root = options.root ?? DEFAULT_ROOT;
    const capture = await renderer.capture({
      key: `${name}-${theme}`, screen: name, theme, url, html, root, waitFor: options.waitFor, inlineImages: true,
      async prepare(page) {
        if (options.css) await page.addStyleTag({ content: options.css });
        await options.prepare?.(page);
      },
    }, htmlIdentity, label);
    for (const font of capture.fontFiles) await Bun.write(join(work, "_fonts", font.name), font.bytes);
    const fontDir = join(work, "output");
    const fonts = await packageFonts(capture.layout.fonts ?? [], fontDir, work);
    const compiled = compileLayout(capture.layout, {
      name, mode: options.mode, bundledFamilies: bundledFamilies(fonts), fontMetrics: metricsForFonts(fonts),
    });
    const assets: Record<string, Uint8Array> = {};
    for (const face of fonts.faces) assets[`Fonts/${face.file}`] = new Uint8Array(await Bun.file(join(fontDir, "Fonts", face.file)).arrayBuffer());
    if (fonts.faces.length) {
      compiled.files["Font+Markswift.swift"] = fonts.swift;
      compiled.files["UIAppFonts.plist.fragment"] = fonts.plist;
    }
    return { ...compiled, assets, warnings: [...capture.warnings, ...fonts.notes], layout: capture.layout };
  } finally {
    try { await renderer.stop(); }
    finally { prepared?.close(); await rm(work, { recursive: true, force: true }); }
  }
}

/** Convenience entry point for pasted HTML. */
export function convertHtml(html: string, options: ConvertOptions = {}): Promise<ConversionResult> {
  return convert({ html }, options);
}
