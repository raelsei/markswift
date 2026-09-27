import type { TextNode } from "../model/semantic.ts";
import type { FontMetrics } from "../model/fonts.ts";
import type { EmitMode } from "./context.ts";
import { type ColorCtx } from "./format.ts";
import { type TextInstrumentation } from "./text-observation.ts";
export declare function textExpr(n: TextNode, ctx: ColorCtx & {
    mode: EmitMode;
    fontMetrics: FontMetrics;
    text?: TextInstrumentation;
}): string[];
