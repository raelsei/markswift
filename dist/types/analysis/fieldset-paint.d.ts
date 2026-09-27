import type { LayoutNode } from "../model/layout.ts";
import type { SemBase, Style } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
interface Admission {
    legend?: LayoutNode;
    reason?: string;
}
/** Admit only decoration whose source border geometry is represented by the current semantic paint. */
export declare function fieldsetAdmission(node: LayoutNode, style: Style): Admission;
/** Metadata adds decoration only; it never changes the measured frame, padding or child layout. */
export declare function fieldsetMetadata(node: LayoutNode, ctx: InferenceContext, style: Style, notes: string[]): Pick<SemBase, "fieldsetPaint" | "fieldsetLegend">;
export {};
