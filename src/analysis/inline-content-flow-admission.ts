import type { LayoutNode } from "../model/layout.ts";
import type { StackNode } from "../model/semantic.ts";
import type { IntrinsicSource } from "./intrinsic-min-content-source.ts";
import { intrinsicFontSettingsReason } from "./intrinsic-font-settings.ts";

export function autoHeightReason(n: LayoutNode, stack: StackNode): string | undefined {
  if (n.preferredSize?.height !== "auto" || n.styles["min-height"] !== "0px" || n.styles["max-height"] !== "none")
    return "authored unconstrained auto height unavailable";
  if (!/^(block|flow-root)$/.test(n.styles.display ?? "") || n.preferredSize.hasRelativePadding
    || stack.measured || stack.allocation || stack.intrinsicFlex || stack.wrap || stack.scroll || stack.table
    || stack.distribution !== "start" || stack.overlays.length || stack.relativeOffset || stack.style.clip || stack.style.hidden)
    return "ordinary unclipped source flow unavailable";
  for (const current of [n, ...n.children]) {
    if (current.tag !== "#text" && (current.styles.contain !== "none" || current.styles["content-visibility"] !== "visible"
      || current.sourceContentVisibility !== "visible"))
      return "contained or skipped source contributions";
    if ((current.styles.position ?? "static") !== "static" || (current.styles.float ?? "none") !== "none"
      || (current.styles.transform ?? "none") !== "none" || (current.styles["aspect-ratio"] ?? "auto") !== "auto")
      return "positioned, transformed or aspect content";
  }
}
export function inlineRowReason(joined: IntrinsicSource, stack: StackNode): string | undefined {
  const n = joined.source, context = joined.context;
  const height = autoHeightReason(n, stack); if (height) return height;
  if (!context.parent || context.parentAxis !== "v" || !/^(block|flow-root)$/.test(context.parentDisplay ?? "")
    || !/^(block|flow-root)$/.test(context.parent.styles.display ?? "")) return "ordinary containing block unavailable";
  if (context.parent.styles.contain !== "none" || context.parent.styles["content-visibility"] !== "visible"
    || context.parent.sourceContentVisibility !== "visible")
    return "contained or skipped containing block";
  if (stack.width.kind !== "fill" || n.preferredSize?.width !== "auto" || n.styles["max-width"] !== "none"
    || !/^(0px|auto)$/.test(n.styles["min-width"] ?? "")) return "unconstrained ordinary fill width unavailable";
  if (stack.maxWidth !== undefined || n.styles["margin-left"] !== "0px" || n.styles["margin-right"] !== "0px")
    return "captured width cap or horizontal margins";
  return inlineWordsReason(n);
}
export function inlineWordsReason(n: LayoutNode): string | undefined {
  if (n.styles.direction !== "ltr" || n.styles["writing-mode"] !== "horizontal-tb" || n.styles["text-indent"] !== "0px"
    || n.styles["white-space"] !== "normal" || (n.styles["overflow-wrap"] && n.styles["overflow-wrap"] !== "normal")
    || (n.styles["word-break"] && n.styles["word-break"] !== "normal")
    || !/^(0px|normal)$/.test(n.styles["word-spacing"] ?? "") || !/^(auto|normal)$/.test(n.styles["line-break"] ?? "")
    || !/^(manual|none)$/.test(n.styles.hyphens ?? "")) return "plain horizontal whole-word flow unavailable";
  return intrinsicFontSettingsReason(n);
}
