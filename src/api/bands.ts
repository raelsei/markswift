/** The browser captures of one conversion: per theme, and per width band. */
import type { Page } from "playwright-core";
import type { BrowserCapture, Capture } from "../browser/capture.ts";
import { captureLayers } from "../browser/layers.ts";
import { DEFAULT_BAND_DEVICES, planBands, type BandPlan } from "../compiler/index.ts";
import { htmlIdentity } from "../input/identity.ts";
import type { CaptureRequest } from "../input/types.ts";
import type { LayoutCondition, Theme } from "../model/layout.ts";
import type { ConvertOptions } from "./types.ts";

/** Throws unless `bp` is unset, `true` or `{ devices?, max? }` with positive integer sizes and an integer max ≥ 320. */
export function validateBreakpoints(bp: ConvertOptions["breakpoints"], prefix = ""): void {
  if (
    bp !== undefined &&
    bp !== true &&
    (!(bp.devices ?? []).every((d) => [d.width, d.height].every((n) => Number.isInteger(n) && n > 0)) ||
      (bp.max !== undefined && !(Number.isInteger(bp.max) && bp.max >= 320)))
  )
    throw new Error(`${prefix}breakpoints devices must be positive integer sizes and max an integer ≥ 320`);
}

/** The band plan of `bp` for a page whose first capture is `first` and reports `conditions`. */
export function planFor(
  bp: NonNullable<ConvertOptions["breakpoints"]>,
  conditions: LayoutCondition[],
  first: { width: number; height: number },
): BandPlan {
  return planBands(conditions, {
    first,
    devices: (bp === true ? undefined : bp.devices) ?? DEFAULT_BAND_DEVICES,
    max: (bp === true ? undefined : bp.max) ?? 1376,
  });
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
    breakpoints?: boolean;
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
      ...(req.breakpoints ? { breakpoints: true } : {}),
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
    if (light) {
      layer.dismiss = light.dismiss;
      // Exits are read on the light page's dismissal only: same layer id, same root index.
      layer.nodes.forEach((n, i) => {
        const exit = light.nodes[i]?.motion?.exit;
        if (exit) n.motion = { ...n.motion, exit };
      });
    } else
      dark.warnings.push({
        source: "capture",
        message: `layer ${layer.id} opens only in the dark theme; its dismissal was not probed`,
      });
  }
  return { primary, dark };
}

/** The capture of every band of `plan`, reusing `first` for the band it belongs to; one browser, in order. Only band 0
 * runs the open-state pass (`req.layers`): its layers are applied once on the merged screen. */
export async function captureBands(
  renderer: BrowserCapture,
  req: Parameters<typeof captureThemes>[1],
  first: { viewport: { width: number; height: number }; captured: { primary: Capture; dark?: Capture } },
  plan: BandPlan,
  timedOut: Promise<never>,
): Promise<Array<{ primary: Capture; dark?: Capture }>> {
  const bands: Array<{ primary: Capture; dark?: Capture }> = [];
  for (const [i, capture] of plan.captures.entries())
    bands.push(
      capture.width === first.viewport.width && capture.height === first.viewport.height
        ? first.captured
        : await captureThemes(renderer, { ...req, viewport: capture, ...(i > 0 ? { layers: false } : {}) }, timedOut),
    );
  return bands;
}
