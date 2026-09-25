/** Computed visual styles and paint inference. */
import { type LayoutNode } from "../model/layout.ts";
import { type Style } from "../model/semantic.ts";
export { textPaintOf } from "./style-background.ts";
export declare function styleOf(n: LayoutNode, notes: string[]): Style;
