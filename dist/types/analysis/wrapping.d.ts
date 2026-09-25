/** Bounded native row reflow; unsupported flex algorithms retain captured positions. */
import type { LayoutNode } from "../model/layout.ts";
import type { Axis, CrossAlign, Distribution, SemBase, StackNode } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
export declare function buildWrapping(n: LayoutNode, base: SemBase, all: AnalyzedChild[], axis: Axis, align: CrossAlign, distribution: Distribution): StackNode;
