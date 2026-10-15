/** The browser captures of one conversion: per theme, and per width band. */
import type { Page } from "playwright-core";
import type { BrowserCapture, Capture } from "../browser/capture.ts";
import type { BandPlan } from "../compiler/index.ts";
import { htmlIdentity } from "../input/identity.ts";
import type { Theme } from "../model/layout.ts";

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
    viewport?: { width: number; height: number };
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
          viewport: req.viewport,
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
