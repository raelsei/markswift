/** CSS flex alignment and distribution mapped to semantic axes. */
import type { LayoutNode } from "../model/layout.ts";
import type { Axis, CrossAlign, Distribution } from "../model/semantic.ts";
export declare function crossAlign(n: LayoutNode, axis: Axis): CrossAlign;
export declare function distributionOf(jc: string | undefined, display: string): Distribution;
