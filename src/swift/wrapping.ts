/** Native row reflow for fixed items and verified equal-width text tracks. */
import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num } from "./format.ts";

export function wrappingExpr(n: StackNode, ctx: EmitContext): string[] {
  const gap = n.wrap!;
  const horizontal = n.distribution === "center" ? ".center" : n.distribution === "end" ? ".trailing" : ".leading";
  const vertical = n.align === "center" ? ".center" : n.align === "end" ? ".bottom" : ".top";
  const columns = ctx.mode === "app" ? gap.columns : undefined;
  const tracks = columns ? `, columns: ${columns}, stretch: ${n.align === "stretch"}` : "";
  const out = [`MarkswiftFlow(columnGap: ${num(gap.columnGap)}, rowGap: ${num(gap.rowGap)}, horizontal: ${horizontal}, vertical: ${vertical}${tracks}) {`];
  for (const child of n.children) out.push(...indent([
    ...ctx.renderNode(child).split("\n"),
    ...(!columns ? [`.frame(width: ${num(child.frame.w)}, height: ${num(child.frame.h)}, alignment: .topLeading)`] : []),
  ], 1));
  out.push("}");
  return out;
}
