/** Read cascaded sizing without mutating the page or trying to parse framework stylesheets. */
import type { Page } from "playwright-core";
import { type PreferredSize } from "../model/layout.ts";
/** Boxless table columns still supply cascade and paint, even without snapshot layout styles. */
export type PreferredSizes = Record<string, PreferredSize & {
    columnStyles?: Record<string, string>;
}>;
/** DOM element paths match snapshot traversal; text and generated pseudo-elements do not count. */
export declare function readPreferredSizes(page: Page, selector: string): Promise<PreferredSizes>;
