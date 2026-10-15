import type { Page } from "playwright-core";
import type { CompileOptions, CompileResult } from "../compiler/index.ts";
import type { LayoutDoc, Theme } from "../model/layout.ts";
import type { ConversionWarning } from "../model/semantic.ts";
export type { HtmlSource } from "../input/types.ts";

export interface ConvertOptions extends Pick<CompileOptions, "name" | "mode" | "palette"> {
  /** Already compiled CSS. Utility and CSS Modules selectors work exactly like normal CSS. */
  css?: string;
  root?: string;
  /**
   * `adaptive` (default) captures the page with `prefers-color-scheme: light`, then `dark`, and
   * emits one view whose colours follow the colour scheme. `light`/`dark` capture one theme.
   */
  theme?: Theme | "adaptive";
  /** Class added to `<html>` for the dark capture, for class-based themes such as `.dark`. */
  darkClass?: string;
  viewport?: { width: number; height: number };
  /**
   * Default true: when the capture contains a grid or flex row that a runtime Layout would reflow, a second capture
   * at 320px (390px when the viewport is ≤ 320px) must agree, or the layout stays pinned.
   */
  probe?: boolean;
  dpr?: number;
  /** Installed Playwright browser channel; defaults to chrome. */
  browserChannel?: string;
  /** For publicly submitted pasted markup: block page scripts and outbound resource requests. */
  untrustedInput?: boolean;
  /** Mounted selector to await before capture. */
  waitFor?: string;
  /** Optional application-specific setup, such as opening a menu; runs before every capture, including each open-state capture. */
  prepare?: (page: Page) => Promise<void>;
  /** Upper bound for the whole conversion (browser, network, font conversion), in ms. Default 120000. */
  timeoutMs?: number;
  /**
   * Capture one layout per CSS width band (`@media` width thresholds) instead of one viewport. `true`: devices
   * 390×844, 834×1210, 1210×834, 1376×1032 up to `max` (default 1376); a band without a device is captured at its
   * lower bound with `viewport.height`; the configured `viewport` is the capture of its own band. Thresholds below
   * 320 px or above `max`, and beyond six bands, are reported. The view emits every element whose authored inputs are
   * equal in all bands once and switches the others at the CSS thresholds (`MarkswiftBands`, at the width offered to
   * the view); a root that does not follow the viewport width keeps the first band's layout, with a warning.
   */
  breakpoints?: true | { devices?: Array<{ width: number; height: number }>; max?: number };
}

export interface ConversionResult extends CompileResult {
  /** Font packaging limitations, browser resource/page errors, viewport-dependent CSS and light/dark pairing limitations. */
  warnings: ConversionWarning[];
  /** The emitted capture: the light one for `adaptive`. */
  layout: LayoutDoc;
  /** The dark capture of an `adaptive` conversion. */
  darkLayout?: LayoutDoc;
  /** One capture per width band (`breakpoints`), ascending; `bands[0].layout` is `layout`. */
  bands?: Array<{ layout: LayoutDoc; darkLayout?: LayoutDoc }>;
}
