/** Read cascaded sizing without mutating the page or trying to parse framework stylesheets. */
import type { Page } from "playwright-core";
import type { PreferredSize } from "../model/layout.ts";
export type PreferredSizes = Record<string, PreferredSize>;
/** DOM element paths match snapshot traversal; text and generated pseudo-elements do not count. */
export declare function readPreferredSizes(page: Page, selector: string): Promise<PreferredSizes>;
