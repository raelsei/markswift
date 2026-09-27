import type { LayoutNode } from "../model/layout.ts";
import type { AllocationTrack } from "../model/allocation.ts";
import type { CrossAlign, Distribution, SemNode } from "../model/semantic.ts";
import type { AnalyzedChild, InferenceContext } from "./context.ts";
/** Numeric computed values are safe; used width pixels are not evidence of an auto basis. */
export declare function fixedLength(value: string | undefined): number | undefined;
export declare function zeroAutomaticMinimum(n: LayoutNode): boolean;
export declare function automaticHeight(n: LayoutNode): boolean;
export declare function hasAutoMargins(n: LayoutNode): boolean;
export declare function hasRelativePadding(n: LayoutNode): boolean;
/** Keep the existing all-width calc identity before an explicit-basis fallback can pin it. */
export declare function equalCalculatedAllocation(n: LayoutNode, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): boolean;
/** A lone intrinsic text item can keep native packing beside non-shrinking fixed items. */
export declare function intrinsicFlexFlow(n: LayoutNode, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): boolean;
/** Cross-axis stretching is not bottom padding; keep only actual insets and end margins. */
export declare function restoreAllocatedInsets(n: LayoutNode, sem: SemNode): void;
export declare function flexAllocation(n: LayoutNode, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution, ctx?: InferenceContext): {
    tracks?: AllocationTrack[];
    reason?: string;
};
