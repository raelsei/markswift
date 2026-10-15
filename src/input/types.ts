/** Browser capture contract, independent of source frameworks and corpus tooling. */
import type { Page } from "playwright-core";
import type { Layer, Theme } from "../model/layout.ts";

/** An element the open-state pass activates (`browser/layers.ts`). */
export interface Trigger {
  /** Element path from the capture root. */
  path: string;
  activation: Layer["activation"];
  /** Set by the native rules (`popovertarget`, `commandfor`, `interestfor`, `details`). */
  relation?: Layer["relation"];
  /** Layer id: slug of the trigger's name, unique per page. */
  id: string;
  /** LayoutNode id of the trigger. */
  trigger: string;
}

export interface CaptureRequest {
  /** Logical screen name (`home`). */
  screen: string;
  theme: Theme;
  /** Fully-qualified URL, served by the source preparer. */
  url: string;
  /** Optional document served at `url`; relative resources resolve against that URL. */
  html?: string;
  /** CSS selector of the capture root; its box is the coordinate origin and screenshot clip. */
  root: string;
  /** Selector that must be attached before capture (mount check). Defaults to `root`. */
  waitFor?: string;
  /** Also take a device-scale screenshot clipped to the capture root (`Capture.png`). */
  screenshot?: boolean;
  /** Capture at this viewport instead of the browser context's (probe captures). */
  viewport?: { width: number; height: number };
  /** Hook after load, before settle (class toggles etc.). */
  prepare?(page: Page): Promise<void>;
  /** Internal to the layer pass: open this trigger and report what it shows (`Capture.opened`). */
  open?: Trigger;
  /** Internal to the layer pass: with `open`, also probe how the layer is dismissed. */
  probeDismiss?: boolean;
}

/** Stable node identity for re-sync. `path` = element-index path from the capture root ("0/2/1"); `tag` lower-case; `attrs` raw. */
export type NodeIdentity = (tag: string, attrs: Record<string, string>, path: string) => string | undefined;

export type HtmlSource = { html: string; baseURL?: string; assetsDir?: string } | { file: string } | { url: string };
