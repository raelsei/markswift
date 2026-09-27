import type { LayoutNode } from "../model/layout.ts";
import type { InferenceContext, SourceTextRun } from "./context.ts";
import { isInlineText, collectRuns } from "./text-runs.ts";
import { hangsLeading, insetsOf } from "./geometry.ts";

/** Partition children in DOM order, retaining inline text and positioned nodes separately. */
export function partitionChildren(n: LayoutNode, ctx: InferenceContext): { flow: LayoutNode[]; abs: LayoutNode[]; runs: SourceTextRun[] } {
  const flow: LayoutNode[] = [];
  const abs: LayoutNode[] = [];
  const runs: SourceTextRun[] = [];
  const contentLeft = n.bounds.x + insetsOf(n.styles)[3];
  for (const c of n.children) {
    // Outside markers occupy no inline space. buildOverlays preserves their measured paint;
    // letting them form a synthetic row here discards the surrounding CSS line-box leading.
    if (c.tag === "::marker" && !/^(absolute|fixed)$/.test(c.styles.position ?? "") && hangsLeading(c.bounds, contentLeft)) continue;
    if (c.tag === "#text" || c.tag === "br" || c.tag === "wbr") {
      runs.push({ node: c, styleOf: n });
      continue;
    }
    if (!c.markerLayout && isInlineText(c)) {
      collectRuns(c, runs);
      continue;
    }
    const pos = c.styles["position"];
    if (pos === "fixed" && n !== ctx.root) ctx.fixed.push(c);
    else if (pos === "absolute" || pos === "fixed") abs.push(c);
    else flow.push(c);
  }
  return { flow, abs, runs };
}
