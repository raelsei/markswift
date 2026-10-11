import type { LayoutNode } from "../model/layout.ts";
import { type Axis, type Size, type Diagnostic, addDiagnostic } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
import { px, round2 } from "../css/index.ts";
import { isFlex, outOfFlow } from "./geometry.ts";

function inFlow(node: LayoutNode): boolean {
  return node.tag !== "#text" && node.styles.display !== "none" && !outOfFlow(node);
}

/** Native stacks can share equal leftover space, but cannot reproduce arbitrary CSS allocation. */
export function flexGrowthSize(
  n: LayoutNode,
  axis: Axis,
  ctx: InferenceContext,
  diagnostics: Diagnostic[],
): Size | undefined {
  const parent = ctx.parent;
  if (!parent || ctx.parentAxis !== axis || !isFlex(ctx.parentDisplay ?? parent.styles.display)) return undefined;
  if (!inFlow(n) || px(n.styles["flex-grow"]) <= 0) return undefined;
  const growers = parent.children.filter((child) => inFlow(child) && px(child.styles["flex-grow"]) > 0);
  if (!growers.length) return undefined;
  const factors = growers.map((child) => px(child.styles["flex-grow"]));
  const sizes = growers.map((child) => (axis === "h" ? child.bounds.w : child.bounds.h));
  const total = factors.reduce((sum, grow) => sum + grow, 0);
  const equalFactors = factors.every((grow) => Math.abs(grow - factors[0]!) < 0.000001);
  const equalSizes = Math.max(...sizes) - Math.min(...sizes) <= 1;
  if (total >= 1 && equalFactors && equalSizes) return { kind: "fill" };

  const dimension = axis === "h" ? "width" : "height";
  const reasons: string[] = [];
  if (total < 1) reasons.push(`flex-grow total ${total} < 1 leaves unused space`);
  if (!equalFactors) reasons.push(`unequal flex-grow factors [${factors.join(",")}]`);
  if (!equalSizes)
    reasons.push(
      `unequal measured ${dimension}s [${sizes.map(round2).join(",")}] (basis, shrink or content constraints)`,
    );
  addDiagnostic(diagnostics, "approximated", "flex-grow", `${reasons.join("; ")}; measured ${dimension} pinned`);
  return { kind: "fixed", px: round2(axis === "h" ? n.bounds.w : n.bounds.h) };
}
