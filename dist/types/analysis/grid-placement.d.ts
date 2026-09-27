import type { LayoutNode } from "../model/layout.ts";
import type { GridPlacement } from "../model/grid.ts";
/** Sparse row auto-placement preserves source ordering; positions come only from CSS lines. */
export declare function gridPlacements(nodes: LayoutNode[], columns: number, flow?: string, explicitRows?: number): {
    placements?: GridPlacement[];
    rows?: number;
    reason?: string;
};
