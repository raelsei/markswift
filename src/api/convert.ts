import type { Page } from "playwright-core";
import { DEFAULT_ROOT } from "../input/root.ts";
import { validateName } from "../compiler/naming.ts";
import { BrowserCapture, type Capture } from "../browser/capture.ts";
import { resolveSource, type ResolvedSource } from "../input/source.ts";
import { compileLayout } from "../compiler/index.ts";
import { packageFonts } from "../fonts/package.ts";
import { registrationSwift } from "../fonts/registration.ts";
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
    const { primary: capture, dark } = await captureThemes(
      renderer,
      {
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
      },
      timedOut,
    );
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
 * the light one is emitted, the dark one pairs its colours.
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
  },
  timedOut: Promise<never>,
): Promise<{ primary: Capture; dark?: Capture }> {
  const shot = (scheme: Theme) =>
    Promise.race([
      renderer.capture(
        {
          screen: req.name,
          theme: scheme,
          url: req.url,
          html: req.html,
          root: req.root,
          waitFor: req.waitFor,
          async prepare(page) {
            if (req.css) await page.addStyleTag({ content: req.css });
            if (scheme === "dark" && req.darkClass)
              await page.evaluate((c) => document.documentElement.classList.add(c), req.darkClass);
            await req.prepare?.(page);
          },
        },
        htmlIdentity,
        req.label,
      ),
      timedOut,
    ]);
  const primary = await shot(req.theme === "dark" ? "dark" : "light");
  return req.theme === "adaptive" ? { primary, dark: await shot("dark") } : { primary };
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
