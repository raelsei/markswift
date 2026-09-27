import type { ContentAutoHeight } from "../model/inline-content-flow.ts";
import type { StackNode } from "../model/semantic.ts";
import { intrinsicSource } from "./intrinsic-min-content-source.ts";
import { insetsOf, EDGES } from "./geometry.ts";
import { fieldsetAdmission } from "./fieldset-paint.ts";
import { autoHeightReason, inlineWordsReason } from "./inline-content-flow-admission.ts";
import { usesGreedyWords } from "./text-flow-admission.ts";

const fixed = (value: string | undefined): number | undefined => value && /^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(value) ? Number.parseFloat(value) : undefined;
export function contentAutoHeightOf(stack: StackNode): ContentAutoHeight | undefined {
  const joined = intrinsicSource(stack);
  if (joined?.kind !== "container" || stack.axis !== "v" || autoHeightReason(joined.source, stack)
    || joined.items.length !== stack.children.length || joined.source.children.length !== joined.items.length) return;
  const n = joined.source, children = stack.children;
  if (!joined.context.parent || joined.context.parentAxis !== "v" || !/^(block|flow-root)$/.test(joined.context.parentDisplay ?? "")) return;
  if (!EDGES.every(edge => fixed(n.styles[`padding-${edge}`]) !== undefined && fixed(n.styles[`border-${edge}-width`]) !== undefined)) return;
  const sourceInsets = insetsOf(n.styles);
  if (!children.some(child => child.kind === "stack" && child.inlineContentFlow)) return;
  const legend = n.tag === "fieldset" ? fieldsetAdmission(n, stack.style).legend : undefined;
  if (n.tag === "fieldset" && (!legend || !stack.fieldsetPaint || joined.items[0]?.node !== legend
    || children[0]?.fieldsetLegend?.key !== stack.fieldsetPaint.key)) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!, item = joined.items[i];
    if (!item || item.sem !== child || n.children[i] !== item.node || intrinsicSource(child)?.source !== item.node) return;
    if (item.node === legend) {
      const text = intrinsicSource(child);
      if (child.kind !== "text" || !child.lineBox || !usesGreedyWords(child) || inlineWordsReason(item.node)
        || text?.kind !== "text" || text.runs.length !== 1 || item.node.children.length !== 1
        || text.runs[0]!.node !== item.node.children[0] || text.runs[0]!.styleOf !== item.node
        || item.node.styles["text-indent"] !== "0px" || item.node.styles["white-space"] !== "normal"
        || item.node.preferredSize?.height !== "auto" || item.node.styles["min-height"] !== "0px" || item.node.styles["max-height"] !== "none") return;
    } else if (child.kind !== "stack" || !child.inlineContentFlow) return;
    if (["top", "left", "right"].some(edge => item.node.styles[`margin-${edge}`] !== "0px")) return;
    if (fixed(item.node.styles["margin-bottom"]) === undefined) return;
  }
  const margin = fixed(joined.items.at(-1)!.node.styles["margin-bottom"])!;
  if (margin && sourceInsets[2] <= 0) return; // No unproved end-margin collapse.
  const gaps = typeof stack.spacing === "number" ? children.slice(1).map(() => stack.spacing as number) : stack.spacing;
  if (gaps.length !== children.length - 1) return;
  for (let i = 1; i < children.length; i++) {
    const owned = i === 1 && legend ? fixed(n.styles["padding-top"])! : fixed(joined.items[i - 1]!.node.styles["margin-bottom"])!;
    if (Math.abs(gaps[i - 1]! - owned) > 0.001) return;
  }
  const leading = legend ? -sourceInsets[0] : 0;
  if (Math.abs(stack.leadInset - leading) > 0.001) return;
  return { sourceInsets, trailingMargin: margin };
}
