import type { StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { intrinsicFlexText } from "../analysis/intrinsic-flex.ts";
import { indent, num, str } from "./format.ts";
import { nativeTextWeight } from "./text-line-box.ts";

/** App-only native sizing; fidelity keeps this stack's measured child frames. */
export function intrinsicFlexExpr(n: StackNode, ctx: EmitContext): string[] {
  const flow = n.intrinsicFlex!;
  const horizontal = n.distribution === "center" ? ".center" : n.distribution === "end" ? ".trailing" : ".leading";
  const vertical = n.align === "center" ? ".center" : n.align === "end" ? ".bottom" : ".top";
  const out = [`MarkswiftIntrinsicFlex(columnGap: ${num(flow.columnGap)}, rowGap: ${num(flow.rowGap)}, wrapping: ${flow.wrapping}, horizontal: ${horizontal}, vertical: ${vertical}, between: ${n.distribution === "between"}, stretch: ${n.align === "stretch"}) {`];
  n.children.forEach((child, index) => {
    const text = intrinsicFlexText(child, flow.wrapping)!;
    const run = text.runs[0]!;
    const inset = child.padding[1] + child.padding[3];
    const font = `UIFont.systemFont(ofSize: ${num(run.font.size)}, weight: .${nativeTextWeight(run.font)})`;
    const words = [...new Set(run.text.split(" "))].map(str).join(", ");
    const minimum = flow.automaticMinimum[index]
      ? `([${words}].map { MarkswiftTextAdvance.width($0, font: ${font}) }.max() ?? 0) + ${num(inset)}` : num(inset);
    out.push(...indent([...ctx.renderNode(child).split("\n"),
      `.layoutValue(key: MarkswiftIntrinsicFlexMinimum.self, value: ${minimum})`,
      `.layoutValue(key: MarkswiftIntrinsicFlexShrink.self, value: ${num(flow.shrink[index]!)})`,
      `.layoutValue(key: MarkswiftIntrinsicFlexInset.self, value: ${num(inset)})`], 1));
  });
  out.push("}");
  return out;
}
