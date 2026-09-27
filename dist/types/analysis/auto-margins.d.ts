import type { LayoutNode } from "../model/layout.ts";
import type { Size } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
/** A native outer alignment frame represents proved auto margins around the painted border. */
export declare function horizontalAutoAlignment(n: LayoutNode, width: Size, ctx: InferenceContext, notes: string[]): "center" | "end" | undefined;
