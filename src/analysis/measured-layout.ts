/** A shared coordinate contract for captured grid and wrapping fallbacks. */
import type { MeasuredLayout, SemBase, SemNode } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { round2 } from "../css/index.ts";

/** Captured fallbacks stack their children in global paint order (z-index), not DOM order. */
export function paintOrder(items: AnalyzedChild[]): AnalyzedChild[] {
  return [...items].sort((a, b) => (a.node.paint ?? 0) - (b.node.paint ?? 0));
}

export function measuredLayoutOf(base: SemBase, children: SemNode[]): MeasuredLayout {
  const [pt, pr, pb, pl] = base.padding;
  return {
    width: round2(Math.max(0, base.frame.w - pl - pr)),
    height: round2(Math.max(0, base.frame.h - pt - pb)),
    frames: children.map((child) => ({
      x: round2(child.frame.x - base.frame.x - pl),
      y: round2(child.frame.y - base.frame.y - pt),
      w: round2(child.frame.w),
      h: round2(child.frame.h),
    })),
  };
}
