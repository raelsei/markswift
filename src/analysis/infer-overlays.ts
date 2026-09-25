import type { LayoutNode } from "../model/layout.ts";
import type { Overlay, SemNode } from "../model/semantic.ts";
import { round2 } from "../css/index.ts";
import type { InferenceContext } from "./context.ts";
import { isInlineText } from "./text-runs.ts";
import { insetsOf, renders, hangsLeading } from "./geometry.ts";

export function buildOverlays(host: LayoutNode, abs: LayoutNode[], firstFlow: LayoutNode | undefined, ctx: InferenceContext, build: (n: LayoutNode, ctx: InferenceContext) => SemNode): Overlay[] {
  const out: Overlay[] = [];
  const flowPaint = firstFlow?.paint ?? Number.POSITIVE_INFINITY;
  // Stacking order = global paint order (accounts for z-index), not DOM order.
  for (const c of [...abs].sort((a, b) => (a.paint ?? 0) - (b.paint ?? 0))) {
    const sem = build(c, { root: ctx.root, fixed: ctx.fixed, bundledFamilies: ctx.bundledFamilies, parent: host });
    const covers = Math.abs(c.bounds.x - host.bounds.x) < 0.5 && Math.abs(c.bounds.y - host.bounds.y) < 0.5 && Math.abs(c.bounds.w - host.bounds.w) < 0.5 && Math.abs(c.bounds.h - host.bounds.h) < 0.5;
    if (covers) {
      sem.width = { kind: "fill" };
      sem.height = { kind: "fill" };
    } else {
      sem.width = { kind: "fixed", px: round2(c.bounds.w) };
      sem.height = { kind: "fixed", px: round2(c.bounds.h) };
    }
    out.push({
      node: sem,
      layer: (c.paint ?? 0) < flowPaint ? "background" : "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers,
    });
  }
  // Outside list markers hang in the host's padding and are dropped from the flow (`stackOf`),
  // so they are drawn here instead: anchored where the browser put them, at their natural size
  // (unlike a positioned overlay, whose box the author pinned).
  const contentLeft = host.bounds.x + insetsOf(host.styles)[3];
  for (const c of host.children) {
    if (c.tag === "#text" || c.tag === "br" || !renders(c) || isInlineText(c)) continue;
    const pos = c.styles["position"];
    if (pos === "absolute" || pos === "fixed" || !hangsLeading(c.bounds, contentLeft)) continue;
    out.push({
      node: build(c, { root: ctx.root, fixed: ctx.fixed, bundledFamilies: ctx.bundledFamilies, parent: host }),
      layer: "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers: false,
    });
  }
  return out;
}
