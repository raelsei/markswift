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
import type { FontFace, Theme } from "../model/layout.ts";
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
  const theme = options.theme ?? "adaptive";
  if (theme !== "light" && theme !== "dark" && theme !== "adaptive") throw new Error("theme must be light, dark or adaptive");
  if (options.darkClass !== undefined && !/^\S+$/.test(options.darkClass)) throw new Error("darkClass must be a single class name");
  const work = await mkdtemp(join(tmpdir(), "markswift-"));
  let prepared: ResolvedSource | undefined;
  const renderer = new BrowserCapture({ viewport, dpr, channel: options.browserChannel, restricted: options.untrustedInput });
  try {
    prepared = await resolveSource(source);
    const { html, url, label } = prepared;
    await renderer.start();
    const name = options.name ?? "ConvertedView";
    // :has is resolved by Chromium. A fragment and a full document use identical root rules.
    const root = options.root ?? DEFAULT_ROOT;
    const shot = (scheme: Theme) => renderer.capture({
      screen: name, theme: scheme, url, html, root, waitFor: options.waitFor,
      async prepare(page) {
        if (options.css) await page.addStyleTag({ content: options.css });
        if (scheme === "dark" && options.darkClass) await page.evaluate((c) => document.documentElement.classList.add(c), options.darkClass);
        await options.prepare?.(page);
      },
    }, htmlIdentity, label);
    // Adaptive: two captures in one browser session; the light one is emitted, the dark one pairs its colours.
    const capture = await shot(theme === "dark" ? "dark" : "light");
    const dark = theme === "adaptive" ? await shot("dark") : undefined;
    for (const font of [...capture.fontFiles, ...(dark?.fontFiles ?? [])]) await Bun.write(join(work, "_fonts", font.name), font.bytes);
    const fontDir = join(work, "output");
    const fonts = await packageFonts(dark ? unionFaces(capture.layout.fonts, dark.layout.fonts) : capture.layout.fonts, fontDir, work);
    const compiled = compileLayout(capture.layout, {
      name, mode: options.mode, bundledFamilies: bundledFamilies(fonts), fontMetrics: metricsForFonts(fonts), dark: dark?.layout,
    });
    const assets: Record<string, Uint8Array> = {};
    for (const face of fonts.faces) assets[`Fonts/${face.file}`] = new Uint8Array(await Bun.file(join(fontDir, "Fonts", face.file)).arrayBuffer());
    if (fonts.faces.length) {
      compiled.files["Font+Markswift.swift"] = fonts.swift;
      compiled.files["UIAppFonts.plist.fragment"] = fonts.plist;
    }
    const pageWarnings = dark ? [...new Set([...capture.warnings, ...dark.warnings])] : capture.warnings;
    return {
      ...compiled, assets, warnings: [...pageWarnings, ...fonts.notes, ...compiled.warnings], layout: capture.layout,
      ...(dark ? { darkLayout: dark.layout } : {}),
    };
  } finally {
    try { await renderer.stop(); }
    finally { prepared?.close(); await rm(work, { recursive: true, force: true }); }
  }
}

/**
 * Faces of both captures: the light list, plus faces only the dark page declared. A face both
 * declared is one face, loaded if either capture loaded it. Identical lists come back as `light`.
 */
function unionFaces(light: FontFace[], dark: FontFace[]): FontFace[] {
  const key = ({ loaded: _, ...face }: FontFace) => JSON.stringify(face);
  const faces = new Map(light.map((f) => [key(f), f]));
  for (const f of dark) {
    const cur = faces.get(key(f));
    if (!cur) faces.set(key(f), f);
    else if (f.loaded && !cur.loaded) faces.set(key(f), { ...cur, loaded: true });
  }
  return [...faces.values()];
}

/** Convenience entry point for pasted HTML. */
export function convertHtml(html: string, options: ConvertOptions = {}): Promise<ConversionResult> {
  return convert({ html }, options);
}
