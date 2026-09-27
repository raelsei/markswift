import type { StackNode } from "../model/semantic.ts";
import { intrinsicSource } from "./intrinsic-min-content-source.ts";
import { inlineRowReason } from "./inline-content-flow-admission.ts";
import { inlineContentOf } from "./inline-content-flow-content.ts";
import { contentAutoHeightOf } from "./inline-content-flow-height.ts";

export function attachInlineContentFlow(stack: StackNode): StackNode {
  delete stack.inlineContentFlow; delete stack.contentAutoHeight;
  const joined = intrinsicSource(stack);
  if (joined?.kind !== "container") return stack;
  if (joined.items.some(item => item.node.tag === "input" && /^(checkbox|radio)$/.test(item.node.attrs.type ?? ""))) {
    const reason = inlineRowReason(joined, stack), content = reason ? undefined : inlineContentOf(stack);
    if (content) stack.inlineContentFlow = content;
    else stack.notes.push(`approximated: inline continuation unavailable (${reason ?? "single proved widget/direct plain source caption unavailable"}); captured baseline flow retained`);
  }
  stack.contentAutoHeight = contentAutoHeightOf(stack);
  return stack;
}
