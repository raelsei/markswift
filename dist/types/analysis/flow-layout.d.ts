/** Flow, float, stack and grid layout inference. */
import { type SemBase, type CrossAlign, type Distribution, type StackNode, type Axis } from "../model/semantic.ts";
import { type AnalyzedChild } from "./context.ts";
/**
 * Stack geometry from measured child frames: spacing per adjacent pair (uniform when equal),
 * and the leading offset the base's padding does not explain. A float's neighbour overlaps its
 * box (the browser shortens line boxes instead of the block), so the gap is the float's margin;
 * a negative `margin-top` really does overlap, and negative spacing reproduces it.
 */
export declare function stackOf(base: SemBase, axis: Axis, all: AnalyzedChild[], align: CrossAlign, distribution: Distribution): StackNode;
/**
 * Measured lines: items overlapping vertically (by more than half the shorter box) and clear of
 * each other horizontally share a line. Boxes that overlap on both axes are not a line but a
 * negative margin — except around a float, whose neighbour's box overlaps it while its ink does
 * not (the browser shortens the line boxes, not the block). Lines run top→bottom, items in a
 * line left→right.
 */
export declare function linesOf(all: AnalyzedChild[]): AnalyzedChild[][];
