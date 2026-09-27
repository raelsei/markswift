import type { LayoutNode } from "../model/layout.ts";
import type { GridNode, SemBase } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
/** Reconstruct only CSS rules whose used tracks and placements agree with the capture. */
export declare function allocatedGrid(n: LayoutNode, base: SemBase, items: AnalyzedChild[], hSpacing: number, vSpacing: number): {
    grid?: GridNode;
    reason?: string;
};
