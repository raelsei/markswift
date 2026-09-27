/** Browser font-box measurements joined to real snapshot line boxes, without DOM mutation. */
import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";
export type TextMetrics = Record<string, {
    ascent: number;
    descent: number;
}>;
export declare function readTextMetrics(page: Page, selector: string): Promise<TextMetrics>;
/** Attach before display:contents flattening and before root-coordinate rebasing. */
export declare function attachTextMetrics(root: Raw, metrics: TextMetrics): void;
