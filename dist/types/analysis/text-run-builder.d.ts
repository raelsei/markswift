/** Normalize measured source fragments and construct styled text runs. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type TextRun } from "../model/semantic.ts";
import { type SourceTextRun, type InferenceContext, type MeasuredTextRun } from "./context.ts";
export interface BuiltTextRuns {
    out: TextRun[];
    built: MeasuredTextRun[];
    painted: LayoutNode[];
    union?: Rect;
}
export declare function buildTextRuns(host: LayoutNode, runs: SourceTextRun[], ctx: InferenceContext, note: (s: string) => void): BuiltTextRuns;
