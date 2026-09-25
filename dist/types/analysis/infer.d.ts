/** Layout tree traversal and semantic node dispatch. */
import type { LayoutDoc } from "../model/layout.ts";
import type { Screen } from "../model/semantic.ts";
import type { InferOptions } from "./context.ts";
export declare function inferScreen(doc: LayoutDoc, name: string, options?: InferOptions): Screen;
export { fontOf } from "./typography.ts";
export { textPaintOf } from "./style.ts";
export type { InferOptions } from "./context.ts";
export type { BundledFamily } from "../model/fonts.ts";
