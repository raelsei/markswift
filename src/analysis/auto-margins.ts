import type { LayoutNode } from "../model/layout.ts";
import type { Size } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
import { insetsOf } from "./geometry.ts";
import { flowBounds, relativePosition } from "./relative-position.ts";

/** A native outer alignment frame represents proved auto margins around the painted border. */
export function horizontalAutoAlignment(n: LayoutNode, width: Size, ctx: InferenceContext, notes: string[]): "center" | "end" | undefined {
  const auto = n.preferredSize?.horizontalAutoMargins;
  if (!auto?.some(Boolean) || !ctx.parent || width.kind === "fill") return;
  const parent = ctx.parent;
  // Flex/grid auto margins own free space inside their allocation algorithm, not a block slot.
  if (ctx.parentAxis !== "v" || !/^(block|flow-root)$/.test(ctx.parentDisplay ?? parent.styles.display ?? "block")) return;
  const reject = (reason: string) => { notes.push(`approximated: horizontal auto margins (${reason}); native block alignment is not reconstructed`); return undefined; };
  if (!/^(block|flow-root|flex|grid|table)$/.test(n.styles.display ?? "block") || (n.styles.float ?? "none") !== "none"
    || /^(absolute|fixed)$/.test(n.styles.position ?? "static")) return reject("outside ordinary block flow");
  if ([n, parent].some(node => (node.styles["writing-mode"] ?? "horizontal-tb") !== "horizontal-tb"
    || (node.styles.direction ?? "ltr") !== "ltr")) return reject("writing mode or direction unsupported");
  if (relativePosition(n).reason) return reject("static used position unavailable");
  const [, right, , left] = insetsOf(parent.styles), frame = flowBounds(n);
  const available = parent.bounds.w - left - right, free = available - frame.w;
  if (!Number.isFinite(free) || free <= 0.5) return;
  // One auto side can absorb all free space only when the other side has no fixed offset.
  const fixedEdge = auto[0] ? "right" : "left";
  const fixedMargin = n.styles[`margin-${fixedEdge}`] ?? "0px";
  if (!(auto[0] && auto[1]) && !/^(?:0|0px)$/.test(fixedMargin)) return reject("nonzero opposite margin");
  const expected = parent.bounds.x + left + (auto[0] ? auto[1] ? free / 2 : free : 0);
  if (Math.abs(frame.x - expected) > 0.5) return reject("captured used position disagrees with auto-margin allocation");
  // Right-auto/left-zero already uses the native block slot's leading edge.
  return auto[0] ? auto[1] ? "center" : "end" : undefined;
}
