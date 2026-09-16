/** A shared coordinate contract for captured grid and wrapping fallbacks. */
import type { MeasuredLayout, SemBase, SemNode } from "../model/semantic.ts";
import { round2 } from "../css/index.ts";

export function measuredLayoutOf(base: SemBase, children: SemNode[]): MeasuredLayout {
  const [pt, pr, pb, pl] = base.padding;
  return {
    width: round2(Math.max(0, base.frame.w - pl - pr)),
    height: round2(Math.max(0, base.frame.h - pt - pb)),
    frames: children.map(child => ({
      x: round2(child.frame.x - base.frame.x - pl), y: round2(child.frame.y - base.frame.y - pt),
      w: round2(child.frame.w), h: round2(child.frame.h),
    })),
  };
}
