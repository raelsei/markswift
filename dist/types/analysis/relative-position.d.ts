import type { LayoutNode, Rect } from "../model/layout.ts";
import type { SemBase } from "../model/semantic.ts";
/** Only authored fixed pixels establish all-width relative positioning. */
export declare function relativePosition(n: LayoutNode): {
    offset?: [number, number];
    reason?: string;
};
/** A child keeps its painted capture coordinates; normal flow excludes only its own shift. */
export declare function flowFrame(n: Pick<SemBase, "frame" | "relativeOffset">): Rect;
export declare function flowBounds(n: LayoutNode): Rect;
export declare function relativeFallback(n: SemBase): boolean;
