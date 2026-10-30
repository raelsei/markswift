import type { LayoutNode } from "../model/layout.ts";
import { type Axis, type Size, type Diagnostic, addDiagnostic } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
import { px, round2 } from "../css/index.ts";
import { insetsOf, isFlex, outOfFlow } from "./geometry.ts";
import { admitFlexRow } from "./flex-row.ts";

function inFlow(node: LayoutNode): boolean {
  return node.tag !== "#text" && node.styles.display !== "none" && !outOfFlow(node);
}

/** A box exactly as tall as its in-flow content (margins included: a flex item's margins do not collapse). */
function contentTall(n: LayoutNode): boolean {
  let top = Infinity;
  let bottom = -Infinity;
  for (const c of n.children) {
    if (c.styles.display === "none" || outOfFlow(c)) continue;
    top = Math.min(top, c.bounds.y - px(c.styles["margin-top"]));
    bottom = Math.max(bottom, c.bounds.y + c.bounds.h + px(c.styles["margin-bottom"]));
  }
  const [t, , b] = insetsOf(n.styles);
  return Math.abs(n.bounds.h - Math.max(0, bottom - top) - t - b) <= 1;
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
  // Growers at their content height took no free space (a column as tall as its content has none): CSS grow is a
  // no-op there, so they hug their content like any column item.
  if (axis === "v" && growers.every(contentTall)) return undefined;
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
  // An admitted row keeps its captured px in fidelity; app mode reflows it (MarkswiftFlexRow).
  if (axis === "h" && admitFlexRow(parent)) return { kind: "fixed", px: round2(n.bounds.w) };
  addDiagnostic(diagnostics, "approximated", "flex-grow", `${reasons.join("; ")}; measured ${dimension} pinned`);
  return { kind: "fixed", px: round2(axis === "h" ? n.bounds.w : n.bounds.h) };
}
