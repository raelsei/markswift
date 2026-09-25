/** Browser-width rules safe to keep responsive in a SwiftUI view. */
import type { LayoutNode } from "../model/layout.ts";
import type { InferenceContext } from "./context.ts";
/** Equal calc-based flex tracks that exactly pack a row can use native equal-width allocation. */
export declare function equalCalculatedFlexWidth(n: LayoutNode, declared: string, ctx: InferenceContext): boolean;
/** Admit only the width rule that a plain vertical SwiftUI stack can reproduce. */
export declare function responsiveFraction(n: LayoutNode, declared: string, ctx: InferenceContext): number | undefined;
