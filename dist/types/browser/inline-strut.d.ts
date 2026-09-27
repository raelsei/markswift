import type { Page } from "playwright-core";
import type { LayoutNode } from "../model/layout.ts";
import type { Raw } from "./snapshot-types.ts";
type InlineMetrics = Record<string, {
    strut?: LayoutNode["inlineStrut"];
    margins?: LayoutNode["inlineControlMargins"];
}>;
/** Font-box facts and Typed OM intent only: no DOM insertion or native target coordinates. */
export declare function readInlineStruts(page: Page, selector: string): Promise<InlineMetrics>;
/** Join before boxless nodes and unmeasured text are pruned. */
export declare function attachInlineStruts(root: Raw, metrics: InlineMetrics): void;
export {};
