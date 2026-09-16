/** Browser capture contract, independent of source frameworks and corpus tooling. */
import type { Page } from "playwright-core";

export type Theme = "light" | "dark";

export interface CaptureRequest {
  /** Output folder + view-name stem, e.g. `home-light`, `home-dark-demo`. */
  key: string;
  /** Logical screen name (`home`). */
  screen: string;
  theme: Theme;
  /** Optional captured UI state; defaults to "normal". */
  demoState?: string;
  /** Fully-qualified URL, served by the source preparer. */
  url: string;
  /** Optional document served at `url`; relative resources resolve against that URL. */
  html?: string;
  /** Make captured image resources self-contained in the layout. */
  inlineImages?: boolean;
  /** CSS selector of the capture root; its box is the coordinate origin and screenshot clip. */
  root: string;
  /** CSS selectors set to display:none before capture (app chrome, overlays). */
  hide?: string[];
  /** Selector that must be attached before capture (mount check). Defaults to `root`. */
  waitFor?: string;
  /** Hook after load, before settle (class toggles etc.). */
  prepare?(page: Page): Promise<void>;
}

/** Stable node identity for re-sync. `path` = element-index path from the capture root ("0/2/1"); `tag` lower-case; `attrs` raw. */
export type NodeIdentity = (tag: string, attrs: Record<string, string>, path: string) => string | undefined;


export type HtmlSource =
  | { html: string; baseURL?: string; assetsDir?: string }
  | { file: string }
  | { url: string };
