import type { BrowserCapture, Capture } from "../browser/capture.ts";
import type { BandPlan } from "../compiler/index.ts";
import { captureThemes } from "./convert.ts";

/** The capture of every band of `plan`, reusing `first` for the band it belongs to; one browser, in order. */
export async function captureBands(
  renderer: BrowserCapture,
  req: Parameters<typeof captureThemes>[1],
  first: { viewport: { width: number; height: number }; captured: { primary: Capture; dark?: Capture } },
  plan: BandPlan,
  timedOut: Promise<never>,
): Promise<Array<{ primary: Capture; dark?: Capture }>> {
  const bands: Array<{ primary: Capture; dark?: Capture }> = [];
  for (const capture of plan.captures)
    bands.push(
      capture.width === first.viewport.width && capture.height === first.viewport.height
        ? first.captured
        : await captureThemes(renderer, { ...req, viewport: capture }, timedOut),
    );
  return bands;
}
