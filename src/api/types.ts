import type { Page } from "playwright-core";
import type { CompileOptions, CompileResult } from "../compiler/index.ts";
import type { LayoutDoc, Theme } from "../model/layout.ts";
export type { HtmlSource } from "../input/types.ts";

export interface ConvertOptions extends Pick<CompileOptions, "name" | "mode"> {
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
  dpr?: number;
  /** Installed Playwright browser channel; defaults to chrome. */
  browserChannel?: string;
  /** For publicly submitted pasted markup: block page scripts and outbound resource requests. */
  untrustedInput?: boolean;
  /** Mounted selector to await before capture. */
  waitFor?: string;
  /** Optional application-specific setup, such as opening a menu; runs before every capture. */
  prepare?: (page: Page) => Promise<void>;
  /** Upper bound for the whole conversion (browser, network, font conversion), in ms. Default 120000. */
  timeoutMs?: number;
}

export interface ConversionResult extends CompileResult {
  /** Relative output paths -> bytes. Add these resources to the iOS target. */
  assets: Record<string, Uint8Array>;
  /** Font packaging limitations, browser resource/page errors and light/dark pairing limitations. */
  warnings: string[];
  /** The emitted capture: the light one for `adaptive`. */
  layout: LayoutDoc;
  /** The dark capture of an `adaptive` conversion. */
  darkLayout?: LayoutDoc;
}
