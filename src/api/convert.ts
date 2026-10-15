import { DEFAULT_ROOT } from "../input/root.ts";
import { validateName } from "../compiler/naming.ts";
import { BrowserCapture } from "../browser/capture.ts";
import { resolveSource, type ResolvedSource } from "../input/source.ts";
import { compileLayout, DEFAULT_BAND_DEVICES, needsProbe, planBands } from "../compiler/index.ts";
import { packageFonts } from "../fonts/package.ts";
import { registrationSwift } from "../fonts/registration.ts";
import { bundledFamilies, metricsForFonts } from "../fonts/metadata.ts";
import type { HtmlSource } from "../input/types.ts";
import type { FontFace } from "../model/layout.ts";
import type { ConvertOptions, ConversionResult } from "./types.ts";
import { captureBands, captureThemes } from "./bands.ts";

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
  const bp = options.breakpoints;
  if (
    bp !== undefined &&
    bp !== true &&
    (!(bp.devices ?? []).every((d) => [d.width, d.height].every((n) => Number.isInteger(n) && n > 0)) ||
      (bp.max !== undefined && !(Number.isInteger(bp.max) && bp.max >= 320)))
  )
    throw new Error("breakpoints devices must be positive integer sizes and max an integer ≥ 320");
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
    // The open-state pass runs on the primary captures only, never on the probe.
    const layered = { ...req, layers: true };
    const first = await captureThemes(renderer, layered, timedOut);
    const plan = bp
      ? planBands(first.primary.layout.conditions, {
          first: viewport,
          devices: (bp === true ? undefined : bp.devices) ?? DEFAULT_BAND_DEVICES,
          max: (bp === true ? undefined : bp.max) ?? 1376,
        })
      : undefined;
    const bands = plan ? await captureBands(renderer, layered, { viewport, captured: first }, plan, timedOut) : [first];
    const { primary: capture, dark } = bands[0]!;
    // Probe warnings are not reported: the reference capture's are. A root that keeps its width (a px width) cannot
    // show another allocation, so its probe proves nothing and is not compiled.
    const probeWidth = plan ? plan.probes[0] : viewport.width > 320 ? 320 : 390;
    const probe =
      options.probe !== false && probeWidth !== undefined && needsProbe(capture.layout)
        ? (
            await captureThemes(
              renderer,
              {
                ...req,
                theme: capture.layout.combo.theme,
                viewport: { width: probeWidth, height: plan?.captures[0]?.height ?? viewport.height },
              },
              timedOut,
            )
          ).primary.layout
        : undefined;
    const captures = bands.flatMap((b) => (b.dark ? [b.primary, b.dark] : [b.primary]));
    const sources = new Map(captures.flatMap((c) => c.fontFiles).map((f) => [f.file, f.bytes]));
    const fonts = await packageFonts(
      captures.length > 1 ? unionFaces(captures.map((c) => c.layout.fonts)) : capture.layout.fonts,
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
    const pageWarnings =
      captures.length > 1
        ? [...new Map(captures.flatMap((c) => c.warnings).map((w) => [w.message, w])).values()]
        : capture.warnings;
    const notes = (plan?.notes ?? []).map((message) => ({
      source: "capture" as const,
      level: "approximated" as const,
      feature: "media-query",
      message,
    }));
    return {
      ...compiled,
      assets,
      warnings: [...pageWarnings, ...notes, ...fonts.notes, ...compiled.warnings],
      layout: capture.layout,
      ...(dark ? { darkLayout: dark.layout } : {}),
      ...(plan
        ? {
            bands: bands.map((b) => ({
              layout: b.primary.layout,
              ...(b.dark ? { darkLayout: b.dark.layout } : {}),
            })),
          }
        : {}),
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
