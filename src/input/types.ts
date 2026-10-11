/** Browser capture contract, independent of source frameworks and corpus tooling. */
import type { Page } from "playwright-core";
import type { Theme } from "../model/layout.ts";

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
  /** Hook after load, before settle (class toggles etc.). */
  prepare?(page: Page): Promise<void>;
}

/** Stable node identity for re-sync. `path` = element-index path from the capture root ("0/2/1"); `tag` lower-case; `attrs` raw. */
export type NodeIdentity = (tag: string, attrs: Record<string, string>, path: string) => string | undefined;

export type HtmlSource = { html: string; baseURL?: string; assetsDir?: string } | { file: string } | { url: string };
