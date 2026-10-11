/** Native row reflow; unsupported flex rules use measured placement. */
import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { horizontalAlignment, indent, num, verticalAlignment } from "./format.ts";

export function wrappingExpr(n: StackNode, ctx: EmitContext): string[] {
  const gap = n.wrap!;
  const out = [
    `MarkswiftFlow(columnGap: ${num(gap.columnGap)}, rowGap: ${num(gap.rowGap)}, horizontal: ${horizontalAlignment(n.distribution)}, vertical: ${verticalAlignment(n.align)}) {`,
  ];
  // Fidelity pins every child to its captured box; app mode lets each child size itself
  // (fixed children still carry their own frame), so chips grow with their text.
  for (const child of n.children)
    out.push(
      ...indent(
        ctx.mode === "fidelity"
          ? [
              ...ctx.renderNode(child),
              `.frame(width: ${num(child.frame.w)}, height: ${num(child.frame.h)}, alignment: .topLeading)`,
            ]
          : ctx.renderNode(child),
        1,
      ),
    );
  out.push("}");
  return out;
}
