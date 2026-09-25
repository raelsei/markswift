import type { LayoutNode } from "../model/layout.ts";
import type { Overlay, SemNode } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
export declare function buildOverlays(host: LayoutNode, abs: LayoutNode[], firstFlow: LayoutNode | undefined, ctx: InferenceContext, build: (n: LayoutNode, ctx: InferenceContext) => SemNode): Overlay[];
