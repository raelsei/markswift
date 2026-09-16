/** Fixed-item native row reflow; unsupported flex rules use measured placement. */
import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num } from "./format.ts";

export function wrappingExpr(n: StackNode, ctx: EmitContext): string[] {
  const gap = n.wrap!;
  const horizontal = n.distribution === "center" ? ".center" : n.distribution === "end" ? ".trailing" : ".leading";
  const vertical = n.align === "center" ? ".center" : n.align === "end" ? ".bottom" : ".top";
  const out = [`MarkswiftFlow(columnGap: ${num(gap.columnGap)}, rowGap: ${num(gap.rowGap)}, horizontal: ${horizontal}, vertical: ${vertical}) {`];
  for (const child of n.children) out.push(...indent([
    ...ctx.renderNode(child).split("\n"),
    `.frame(width: ${num(child.frame.w)}, height: ${num(child.frame.h)}, alignment: .topLeading)`,
  ], 1));
  out.push("}");
  return out;
}
