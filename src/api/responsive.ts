import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserCapture, type Capture } from "../browser/capture.ts";
import { compileResponsiveLayouts } from "../compiler/index.ts";
import { validateName } from "../compiler/naming.ts";
import { packageFonts } from "../fonts/package.ts";
import { bundledFamilies, metricsForFonts, unionFaces } from "../fonts/metadata.ts";
import { htmlIdentity } from "../input/identity.ts";
import { DEFAULT_ROOT } from "../input/root.ts";
import { resolveSource, type ResolvedSource } from "../input/source.ts";
import type { HtmlSource } from "../input/types.ts";
import type { ResponsiveConversionResult, ResponsiveConvertOptions } from "./types.ts";

/** Capture two explicit CSS viewport states and compile one responsive SwiftUI view. */
export async function convertResponsive(source: HtmlSource, options: ResponsiveConvertOptions): Promise<ResponsiveConversionResult> {
  validateResponsiveInput(source, options);
  const work = await mkdtemp(join(tmpdir(), "markswift-responsive-"));
  let prepared: ResolvedSource | undefined;
  try {
    // Keep the same source server, markup, CSS and preparation hook for both captures.
    prepared = await resolveSource(source);
    const { html, url, label } = prepared;
    const captureAt = async (branch: "compact" | "regular"): Promise<Capture> => {
      const renderer = new BrowserCapture({
        viewport: options[branch].viewport,
        dpr: options.dpr ?? 1,
        channel: options.browserChannel,
        restricted: options.untrustedInput,
      });
      try {
        await renderer.start();
        return await renderer.capture({
          key: `${options.name}-${branch}-${options.theme ?? "light"}`,
          screen: options.name,
          theme: options.theme ?? "light",
          url,
          html,
          root: options.root ?? DEFAULT_ROOT,
          waitFor: options.waitFor,
          inlineImages: true,
          async prepare(page) {
            if (options.css) await page.addStyleTag({ content: options.css });
            await options.prepare?.(page);
            const actualViewport = page.viewportSize();
            const expectedViewport = options[branch].viewport;
            if (actualViewport?.width !== expectedViewport.width || actualViewport.height !== expectedViewport.height) {
              throw new Error(
                `${branch} capture viewport changed during prepare(); expected ` +
                `${expectedViewport.width}×${expectedViewport.height}, received ` +
                `${actualViewport?.width ?? "unknown"}×${actualViewport?.height ?? "unknown"}`,
              );
            }
          },
        }, htmlIdentity, label);
      } finally {
        await renderer.stop();
      }
    };
    const compact = await captureAt("compact");
    const regular = await captureAt("regular");
    const fontFiles = new Map<string, Uint8Array>();
    for (const font of [...compact.fontFiles, ...regular.fontFiles]) fontFiles.set(font.name, font.bytes);
    if (fontFiles.size) await mkdir(join(work, "_fonts"), { recursive: true });
    for (const [name, bytes] of fontFiles) await writeFile(join(work, "_fonts", name), bytes);
    const fontDir = join(work, "output");
    const fonts = await packageFonts(unionFaces([compact.layout, regular.layout]), fontDir, work);
    const assets: Record<string, Uint8Array> = {};
    for (const face of fonts.faces) assets[`Fonts/${face.file}`] = new Uint8Array(await readFile(join(fontDir, "Fonts", face.file)));
    const supportFiles = fonts.faces.length ? {
      "Font+Markswift.swift": fonts.swift,
      "UIAppFonts.plist.fragment": fonts.plist,
    } : undefined;
    const compiled = compileResponsiveLayouts({
      name: options.name,
      breakpoint: options.breakpoint,
      compact: { layout: compact.layout, viewportWidth: options.compact.viewport.width },
      regular: { layout: regular.layout, viewportWidth: options.regular.viewport.width },
      mode: options.mode,
      bundledFamilies: bundledFamilies(fonts),
      fontMetrics: metricsForFonts(fonts),
      supportFiles,
      assets,
    });
    return {
      ...compiled,
      layouts: { compact: compact.layout, regular: regular.layout },
      warnings: aggregateWarnings(compact.warnings, regular.warnings, fonts.notes, options),
      branchWarnings: { compact: compact.warnings, regular: regular.warnings },
    };
  } finally {
    try { await prepared?.close(); }
    finally { await rm(work, { recursive: true, force: true }); }
  }
}

function aggregateWarnings(
  compact: readonly string[], regular: readonly string[], fontNotes: readonly string[], options: ResponsiveConvertOptions,
): string[] {
  const warnings = [...new Set([...compact, ...regular, ...fontNotes])];
  const mediaIndex = warnings.findIndex((message) => message.startsWith("CSS @media conditions "));
  if (mediaIndex >= 0) {
    const rest = warnings.filter((message) => !message.startsWith("CSS @media conditions "));
    rest.splice(mediaIndex, 0,
      `CSS @media sampled at compact ${options.compact.viewport.width}px and regular ${options.regular.viewport.width}px; ` +
      `generated Swift switches branches at width ≤ ${options.breakpoint} points. ` +
      "Intermediate widths and other media states are not reconstructed.",
    );
    return rest;
  }
  return warnings;
}

function validateResponsiveInput(source: HtmlSource, options: ResponsiveConvertOptions): void {
  validateName(options.name);
  const viewportValid = (viewport: { width: number; height: number } | undefined) =>
    !!viewport && [viewport.width, viewport.height].every((n) => Number.isInteger(n) && n > 0);
  if (!viewportValid(options?.compact?.viewport) || !viewportValid(options?.regular?.viewport)) {
    throw new Error("compact and regular viewport dimensions must be positive integers");
  }
  if (!Number.isSafeInteger(options.breakpoint) || options.breakpoint <= 0 ||
      options.compact.viewport.width > options.breakpoint || options.regular.viewport.width <= options.breakpoint) {
    throw new Error("breakpoint must be a positive integer with compact.width <= breakpoint < regular.width");
  }
  if (options.dpr !== undefined && (!Number.isFinite(options.dpr) || options.dpr <= 0)) {
    throw new Error("dpr must be positive and finite");
  }
  if (["html", "file", "url"].filter((key) => key in source).length !== 1) {
    throw new Error("provide exactly one of html, file or url");
  }
  if (options.untrustedInput && (!("html" in source) || source.assetsDir || source.baseURL)) {
    throw new Error("untrustedInput accepts pasted HTML without assetsDir or baseURL only");
  }
}
