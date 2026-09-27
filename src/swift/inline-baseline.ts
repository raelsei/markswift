import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num, str } from "./format.ts";

export function inlineBaselineExpr(node: StackNode, context: EmitContext): string[] {
  const baseline = node.inlineBaseline!;
  const spacing = Array.isArray(node.spacing) ? node.spacing : node.children.slice(1).map(() => node.spacing as number);
  const items = baseline.items.map(item => `MarkswiftInlineBaselineItem(widget: ${item.kind === "widget"}, baseline: ${num(item.baseline)}, height: ${num(item.height)}, top: ${num(item.top)}, bottom: ${num(item.bottom)})`).join(", ");
  const out = [`MarkswiftInlineBaselineRow(id: ${str(node.id)}, strutAscent: ${num(baseline.strutAscent)}, strutDescent: ${num(baseline.strutDescent)}, items: [${items}], spacing: [${spacing.map(num).join(", ")}], leading: ${num(node.leadInset)}) {`];
  for (const child of node.children) out.push(...indent(context.renderNode(child).split("\n"), 1));
  out.push("}"); return out;
}
