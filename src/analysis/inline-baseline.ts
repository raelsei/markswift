import type { LayoutNode } from "../model/layout.ts";
import type { StackNode } from "../model/semantic.ts";
import type { AnalyzedChild, InferenceContext } from "./context.ts";
import { flowFrame } from "./relative-position.ts";
import { intrinsicFontSettingsReason } from "./intrinsic-font-settings.ts";
import { fontOf } from "./typography.ts";
import { EDGES, insetsOf } from "./geometry.ts";
import { inlineCaptionBoxHeight } from "./inline-caption-box.ts";

/** A captured widget border baseline is admitted only beside independently measured plain text. */
export function inlineBaselineOf(node: LayoutNode, items: AnalyzedChild[], stack: StackNode, context?: Pick<InferenceContext, "root" | "parent">, continuation?: LayoutNode): StackNode["inlineBaseline"] {
  const widgets = items.filter(item => item.node.tag === "input" && /^(checkbox|radio)$/.test(item.node.attrs.type ?? ""));
  if (!widgets.length || !items.some(item => item.sem.kind === "text")) return;
  const decline = (reason: string) => {
    stack.notes.push(`approximated: inline widget baseline unavailable (${reason}); native row alignment retained`);
    return undefined;
  };
  if (items.length !== 2 || widgets.length !== 1 || stack.children.length !== 2) return decline("requires one widget and one plain text box");
  if (!/^(block|flow-root)$/.test(node.styles.display ?? "") || node.preferredSize?.height !== "auto" || node.preferredSize.hasRelativePadding || stack.distribution !== "start")
    return decline("parent is not ordinary auto-height inline flow");
  const strut = node.inlineStrut;
  if (!strut) return decline("parent CSS strut metrics missing");
  if (![strut.ascent, strut.descent, strut.lineHeight].every(Number.isInteger) || strut.lineHeight < strut.ascent + strut.descent)
    return decline("fractional or tight parent font-box leading");
  const fontReason = intrinsicFontSettingsReason(node);
  if (fontReason) return decline(fontReason);
  const walk = (n: LayoutNode): boolean => {
    const s = n.styles;
    return (s.direction === undefined || s.direction === "ltr") && (s["writing-mode"] === undefined || s["writing-mode"] === "horizontal-tb")
      && (s.position === undefined || s.position === "static") && (s.float === undefined || s.float === "none")
      && (s.transform === undefined || s.transform === "none") && !n.children.some(child => !walk(child));
  };
  if (!walk(node)) return decline("relative, transformed, floated or non-horizontal flow");
  const ancestors = (current: LayoutNode, parents: LayoutNode[] = []): LayoutNode[] | undefined => {
    if (current === node) return parents;
    for (const child of current.children) { const found = ancestors(child, [...parents, current]); if (found) return found; }
  };
  if (context && (ancestors(context.root) ?? [context.parent].filter((value): value is LayoutNode => !!value)).some(parent =>
    (parent.styles.position && parent.styles.position !== "static") || (parent.styles.transform && parent.styles.transform !== "none")))
    return decline("relative or transformed ancestor");
  const parentFont = fontOf(node.styles, {}), widget = widgets[0]!, text = items.find(item => item.sem.kind === "text")!;
  if (text.sem.kind !== "text" || (!continuation && text.sem.lines !== 1) || !text.sem.lineBox || text.sem.lineLimit !== undefined || text.sem.truncate
    || text.sem.runs.some(run => JSON.stringify(run.font) !== JSON.stringify(parentFont) || run.italic || run.bound || run.baselineOffset !== undefined || run.gap !== undefined)
    || text.sem.padding.some(Boolean) || text.sem.overlays.length || text.sem.style.fills.length) return decline("unproved plain single-line font box");
  if (widget.node.styles.appearance !== "auto" || widget.node.styles["vertical-align"] !== "baseline"
    || (text.node.styles["vertical-align"] && text.node.styles["vertical-align"] !== "baseline")) return decline("unproved native appearance or authored vertical alignment");
  const margins = widget.node.inlineControlMargins;
  if (!margins || !margins.every(value => Number.isFinite(value) && value >= 0)) return decline("fixed nonnegative widget margins missing");
  const control = widget.sem, frame = flowFrame(control);
  if (control.kind !== "control" || !/^(toggle|radio)$/.test(control.control) || control.content.length || control.padding.some(Boolean)
    || control.width.kind !== "fixed" || control.height.kind !== "fixed" || frame.w !== frame.h || ![13, 16].includes(frame.h))
    return decline("native widget dimensions have no bounded guide proof");
  if (!EDGES.every(edge => /^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(node.styles[`padding-${edge}`] ?? "")
    && /^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(node.styles[`border-${edge}-width`] ?? "") && node.styles[`border-${edge}-style`] !== undefined))
    return decline("parent CSS content insets unavailable");
  const sourceInsets = insetsOf(node.styles);
  const captionHeight = continuation ? inlineCaptionBoxHeight(text.sem, strut.lineHeight, continuation) : flowFrame(text.sem).h;
  if (captionHeight === undefined) return decline("captured continuation font-box union is unproved");
  const strutAscent = strut.ascent + Math.floor((strut.lineHeight - strut.ascent - strut.descent) / 2), strutDescent = strut.lineHeight - strutAscent;
  const contentTop = stack.frame.y + sourceInsets[0], textFrame = flowFrame(text.sem), baseline = textFrame.y + text.sem.lineBox.firstBaseline;
  if (Math.abs(frame.y + frame.h - baseline) > .5) return decline("observed widget border does not share the measured text baseline");
  const contractItems = stack.children.map(child => {
    if (child === control) return { kind: "widget" as const, baseline: frame.h, height: frame.h, top: margins[0], bottom: margins[2] };
    return { kind: "text" as const, baseline: text.sem.kind === "text" ? text.sem.lineBox!.firstBaseline : 0, height: captionHeight, top: 0, bottom: 0 };
  });
  const predictedBaseline = Math.max(strutAscent, ...contractItems.map(item => item.baseline + item.top));
  const predictedDescent = Math.max(strutDescent, ...contractItems.map(item => item.height - item.baseline + item.bottom));
  const contentHeight = stack.frame.h - sourceInsets[0] - sourceInsets[2];
  const continuationHeight = continuation ? (text.sem.lines - 1) * strut.lineHeight : 0;
  if (Math.abs(baseline - contentTop - predictedBaseline) > .5 || Math.abs(contentHeight - predictedBaseline - predictedDescent - continuationHeight) > .5)
    return decline("captured source line does not satisfy the parent strut and fixed margins");
  stack.notes.push(continuation
    ? "approximated: native continuation baseline-guide or font-box mismatch is reported at runtime; original glyph drawing remains unproved"
    : "approximated: newly multiline inline text or a native baseline-guide mismatch is reported at runtime and uses native baseline flow; CSS inline reconstruction then unavailable");
  return { strutAscent, strutDescent, sourceInsets, items: contractItems };
}
