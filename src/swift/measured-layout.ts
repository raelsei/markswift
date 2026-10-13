/** Emit measured content coordinates before the owning node's padding and paint. */
import type { GridNode, StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num } from "./format.ts";

export function measuredLayoutExpr(n: GridNode | StackNode, ctx: EmitContext): string[] {
  const layout = n.measured!;
  const out = [`MarkswiftMeasuredLayout(width: ${num(layout.width)}, height: ${num(layout.height)}, frames: [`];
  for (const frame of layout.frames)
    out.push(`    CGRect(x: ${num(frame.x)}, y: ${num(frame.y)}, width: ${num(frame.w)}, height: ${num(frame.h)}),`);
  // App mode: children taller than captured (Dynamic Type) push the frames below them down.
  out.push(ctx.mode === "app" ? "], grows: true) {" : "]) {");
  for (const child of n.children) out.push(...indent(ctx.renderNode(child), 1));
  out.push("}");
  return out;
}
