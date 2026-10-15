import type { Page } from "playwright-core";
import { DEFAULT_ROOT } from "../input/root.ts";
import { validateName } from "../compiler/naming.ts";
import { BrowserCapture, type Capture } from "../browser/capture.ts";
import { captureLayers } from "../browser/layers.ts";
import { resolveSource, type ResolvedSource } from "../input/source.ts";
import { compileLayout, needsProbe } from "../compiler/index.ts";
import { packageFonts } from "../fonts/package.ts";
import { registrationSwift } from "../fonts/registration.ts";
import { bundledFamilies, metricsForFonts } from "../fonts/metadata.ts";
import { htmlIdentity } from "../input/identity.ts";
import type { CaptureRequest, HtmlSource } from "../input/types.ts";
import type { FontFace, Theme } from "../model/layout.ts";
import type { ConvertOptions, ConversionResult } from "./types.ts";

/** Convert a document, fragment, HTML file or rendered URL through the same measured pipeline. */
export async function convert(source: HtmlSource, options: ConvertOptions = {}): Promise<ConversionResult> {
  validateName(options.name ?? "ConvertedView");
  const viewport = options.viewport ?? { width: 390, height: 844 };
  const dpr = options.dpr ?? 1;
  if (
    ![viewport.width, viewport.height].every((n) => Number.isInteger(n) && n > 0) ||
    !Number.isFinite(dpr) ||
    dpr <= 0
  ) {
    throw new Error("viewport dimensions must be positive integers and dpr must be positive and finite");
  }
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive and finite");
  if (["html", "file", "url"].filter((key) => key in source).length !== 1)
    throw new Error("provide exactly one of html, file or url");
  if (options.untrustedInput && (!("html" in source) || source.assetsDir || source.baseURL)) {
    throw new Error("untrustedInput accepts pasted HTML without assetsDir or baseURL only");
  }
  const theme = options.theme ?? "adaptive";
  if (theme !== "light" && theme !== "dark" && theme !== "adaptive")
    throw new Error("theme must be light, dark or adaptive");
  if (options.darkClass !== undefined && !/^\S+$/.test(options.darkClass))
    throw new Error("darkClass must be a single class name");
  let prepared: ResolvedSource | undefined;
  const deadline = AbortSignal.timeout(timeoutMs);
  const renderer = new BrowserCapture({
    viewport,
    dpr,
    channel: options.browserChannel,
    restricted: options.untrustedInput,
    signal: deadline,
  });
  // Closing Chrome rejects most of what is pending in it (goto, evaluate, fonts.ready, image decode), but
  // Playwright never settles a `newPage` in flight as its context closes: each capture also races the deadline.
  // Not yet reported upstream; repro: research/audit-2026-10-10/upstream-repros/pw.mjs.
  const stopOnTimeout = () => void renderer.stop().catch(() => {});
  deadline.addEventListener("abort", stopOnTimeout, { once: true });
  const timedOut = new Promise<never>((_, reject) =>
    deadline.addEventListener("abort", () => reject(deadline.reason), { once: true }),
  );
  timedOut.catch(() => {}); // the deadline may fire with no capture awaiting it
  try {
    prepared = await resolveSource(source);
    const { html, url, label } = prepared;
    await renderer.start();
    deadline.throwIfAborted(); // the deadline fired mid-launch, before there was a browser to close
    const name = options.name ?? "ConvertedView";
    // :has is resolved by Chromium. A fragment and a full document use identical root rules.
    const req = {
      name,
      url,
      html,
      label,
      root: options.root ?? DEFAULT_ROOT,
      theme,
      css: options.css,
      darkClass: options.darkClass,
      waitFor: options.waitFor,
      prepare: options.prepare,
    };
    const { primary: capture, dark } = await captureThemes(renderer, { ...req, layers: true }, timedOut);
    // Probe warnings are not reported: the reference capture's are. A root that keeps its width (a px width) cannot
    // show another allocation, so its probe proves nothing and is not compiled.
    const probe =
      options.probe !== false && needsProbe(capture.layout)
        ? (
            await captureThemes(
              renderer,
              {
                ...req,
                theme: capture.layout.combo.theme,
                viewport: { width: viewport.width > 320 ? 320 : 390, height: viewport.height },
              },
              timedOut,
            )
          ).primary.layout
        : undefined;
    const sources = new Map([...capture.fontFiles, ...(dark?.fontFiles ?? [])].map((f) => [f.file, f.bytes]));
    const fonts = await packageFonts(
      dark ? unionFaces([capture.layout.fonts, dark.layout.fonts]) : capture.layout.fonts,
      sources,
      undefined,
      deadline,
    );
    deadline.throwIfAborted(); // an aborted converter returns a note, not an error
    const compiled = compileLayout(capture.layout, {
      name,
      mode: options.mode,
      bundledFamilies: bundledFamilies(fonts),
      fontMetrics: metricsForFonts(fonts),
      dark: dark?.layout,
      probe: probe && probe.size.w !== capture.layout.size.w ? probe : undefined,
      palette: options.palette,
    });
    const assets: Record<string, Uint8Array> = { ...compiled.assets, ...fonts.assets };
    if (fonts.faces.length) {
      compiled.files[`${name}+Fonts.swift`] = registrationSwift(fonts.faces, name);
      compiled.files[`${name}+UIAppFonts.plist.fragment`] = fonts.plist;
    }
    const pageWarnings = dark
      ? [...new Map([...capture.warnings, ...dark.warnings].map((w) => [w.message, w])).values()]
      : capture.warnings;
    return {
      ...compiled,
      assets,
      warnings: [...pageWarnings, ...fonts.notes, ...compiled.warnings],
      layout: capture.layout,
      ...(dark ? { darkLayout: dark.layout } : {}),
    };
  } catch (error) {
    if (deadline.aborted) throw new Error(`conversion timed out after ${timeoutMs} ms`, { cause: error });
    throw error;
  } finally {
    deadline.removeEventListener("abort", stopOnTimeout);
    try {
      await renderer.stop();
    } finally {
      prepared?.close();
    }
  }
}

/**
 * Capture one page in its theme(s), each raced against `timedOut`. Adaptive: two captures in one browser session;
 * the light one is emitted, the dark one pairs its colours. `layers`: also run the open-state pass on each theme
 * (the primary one probes dismissal; dark copies it by layer id).
 */
export async function captureThemes(
  renderer: BrowserCapture,
  req: {
    name: string;
    url: string;
    html?: string;
    label: string;
    root: string;
    theme: Theme | "adaptive";
    css?: string;
    darkClass?: string;
    waitFor?: string;
    prepare?: (page: Page) => Promise<void>;
    viewport?: { width: number; height: number };
    layers?: boolean;
  },
  timedOut: Promise<never>,
): Promise<{ primary: Capture; dark?: Capture }> {
  const race = (spec: CaptureRequest) => Promise.race([renderer.capture(spec, htmlIdentity, req.label), timedOut]);
  const shot = async (scheme: Theme, probeDismiss: boolean) => {
    const spec: CaptureRequest = {
      screen: req.name,
      theme: scheme,
      url: req.url,
      html: req.html,
      root: req.root,
      waitFor: req.waitFor,
      viewport: req.viewport,
      async prepare(page) {
        if (req.css) await page.addStyleTag({ content: req.css });
        if (scheme === "dark" && req.darkClass)
          await page.evaluate((c) => document.documentElement.classList.add(c), req.darkClass);
        await req.prepare?.(page);
      },
    };
    const capture = await race(spec);
    if (req.layers) await captureLayers(race, spec, capture, { probeDismiss });
    return capture;
  };
  const primary = await shot(req.theme === "dark" ? "dark" : "light", true);
  if (req.theme !== "adaptive") return { primary };
  const dark = await shot("dark", false);
  for (const layer of dark.layout.layers ?? []) {
    const light = primary.layout.layers?.find((l) => l.id === layer.id);
    if (light) layer.dismiss = light.dismiss;
    else
      dark.warnings.push({
        source: "capture",
        message: `layer ${layer.id} opens only in the dark theme; its dismissal was not probed`,
      });
  }
  return { primary, dark };
}

/**
 * Faces of several captures: the first list, plus faces only a later one declared. A face several
 * declared is one face, loaded if any capture loaded it. Identical lists come back as the first.
 */
export function unionFaces(lists: FontFace[][]): FontFace[] {
  const key = ({ loaded: _, ...face }: FontFace) => JSON.stringify(face);
  const faces = new Map<string, FontFace>();
  for (const list of lists)
    for (const f of list) {
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
