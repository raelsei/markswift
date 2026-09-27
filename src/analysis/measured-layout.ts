/** A shared coordinate contract for captured grid and wrapping fallbacks. */
import type { MeasuredLayout, SemBase, SemNode } from "../model/semantic.ts";
import { round2 } from "../css/index.ts";
import { flowFrame } from "./relative-position.ts";

export function measuredLayoutOf(base: SemBase, children: SemNode[]): MeasuredLayout {
  const [pt, pr, pb, pl] = base.padding;
  return {
    width: round2(Math.max(0, base.frame.w - pl - pr)),
    height: round2(Math.max(0, base.frame.h - pt - pb)),
    frames: children.map(child => {
      const frame = flowFrame(child);
      return { x: round2(frame.x - base.frame.x - pl), y: round2(frame.y - base.frame.y - pt), w: round2(frame.w), h: round2(frame.h) };
    }),
  };
}
