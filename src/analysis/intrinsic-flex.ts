/** Intrinsic plain-word flex rows; other allocation families retain their own admission. */
import type { LayoutNode } from "../model/layout.ts";
import type { CrossAlign, Distribution, SemBase, SemNode, StackNode, TextNode } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { usesGreedyWords } from "./text-flow-admission.ts";
import { automaticHeight, fixedLength, hasAutoMargins, hasRelativePadding, restoreAllocatedInsets } from "./flex-allocation.ts";
import { parseDeclared, px } from "../css/syntax.ts";
import { EDGES, insetsOf } from "./geometry.ts";
import { measuredLayoutOf } from "./measured-layout.ts";
import { finish } from "./node-base.ts";
import { relativeFallback } from "./relative-position.ts";
import { intrinsicFontSettingsReason } from "./intrinsic-font-settings.ts";

/** Decorations preserve advances; at most two plain words cannot trigger native balancing. */
export function isIntrinsicFlexCaption(node: TextNode): boolean {
  if (!node.lineBox || node.lines !== 1 || node.runs.length !== 1 || node.width.kind !== "hug" || node.height.kind !== "hug"
      || node.padding.some(value => value !== 0) || !plainBox(node) || node.style.fills.length || node.style.shadows.length) return false;
  const run = node.runs[0]!;
  if (run.text.split(" ").length > 2) return false;
  return usesGreedyWords({ ...node, runs: [{ ...run, decoration: undefined }] });
}

export function intrinsicFlexText(node: SemNode, wrapping: boolean): TextNode | undefined {
  if (node.kind === "text" && node.lineBox && usesGreedyWords(node)) return node;
  if (!wrapping && node.kind === "control" && (node.control === "link" || node.control === "button")
      && !node.files && !node.disabled && node.content.length === 1) {
    const caption = node.content[0]!;
    if (caption.kind === "text" && isIntrinsicFlexCaption(caption)) return caption;
  }
}

function plainBox(node: SemNode): boolean {
  return !node.overlays.length && !node.relativeOffset && !relativeFallback(node) && !node.style.hidden && !node.style.clip
    && !node.style.transform && !node.style.mask && !node.style.clipPath && !node.style.filters
    && !node.style.fills.some(fill => fill.kind !== "solid")
    && node.minWidth === undefined && node.maxWidth === undefined && node.minHeight === undefined && node.maxHeight === undefined;
}

const preferred = (node: LayoutNode, property: "width" | "height") => node.preferredSize?.[property] ?? parseDeclared(node.attrs.style)[property] ?? "auto";
const pixelGap = (value: string | undefined) => value === undefined || value === "normal" ? 0 : fixedLength(value);
type IntrinsicFlexAdmission = NonNullable<StackNode["intrinsicFlex"]> | { fontFallback: string };

export function intrinsicFlex(n: LayoutNode, base: SemBase, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): IntrinsicFlexAdmission | undefined {
  const wrapping = n.styles["flex-wrap"] === "wrap";
  if (!items.length || !/^(row)?$/.test(n.styles["flex-direction"] ?? "") || n.styles.direction === "rtl"
      || !/^(horizontal-tb)?$/.test(n.styles["writing-mode"] ?? "") || hasRelativePadding(n)
      || !/^(?:wrap|nowrap)$/.test(n.styles["flex-wrap"] ?? "nowrap")
      || !/^(start|center|end|between)$/.test(distribution) || !/^(start|center|end|stretch)$/.test(align)
      || !/^(normal|flex-start|start|center|flex-end|end|space-between)?$/.test(n.styles["justify-content"] ?? "")
      || !automaticHeight(n) || base.minHeight !== undefined || base.maxHeight !== undefined
      || (n.styles["overflow-x"] ?? "visible") !== "visible" || (n.styles["overflow-y"] ?? "visible") !== "visible"
      || (n.styles.display === "inline-flex" && preferred(n, "width") === "auto")
      || base.relativeOffset || relativeFallback(base) || base.overlays.length || base.style.clip || base.style.transform || base.style.mask || base.style.clipPath) return;
  const columnGap = pixelGap(n.styles["column-gap"]), rowGap = pixelGap(n.styles["row-gap"]);
  if (columnGap === undefined || rowGap === undefined) return;
  // A content-height host has no spare cross-row space for align-content to distribute.
  if (!/^(normal|stretch|start|flex-start|center|end|flex-end)?$/.test(n.styles["align-content"] ?? "")) return;
  const shrink: number[] = [], automaticMinimum: boolean[] = [];
  for (const { node, sem } of items) {
    const s = node.styles, declared = parseDeclared(node.attrs.style);
    const basis = node.preferredSize?.flexBasis ?? s["flex-basis"] ?? declared["flex-basis"] ?? "auto";
    const factor = Number(s["flex-shrink"] ?? 1);
    if (!n.children.includes(node) || !plainBox(sem) || hasAutoMargins(node) || hasRelativePadding(node)
        || preferred(node, "width") !== "auto" || preferred(node, "height") !== "auto" || basis !== "auto"
        || Number(s["flex-grow"] ?? 0) !== 0 || (factor !== 0 && factor !== 1) || Number(s.order ?? 0) !== 0
        || !/^(auto|0(?:px)?)$/.test(s["min-width"] ?? "auto") || (s["max-width"] ?? "none") !== "none"
        || !/^(auto|0(?:px)?)$/.test(s["min-height"] ?? "auto") || (s["max-height"] ?? "none") !== "none"
        || (s["aspect-ratio"] ?? "auto") !== "auto" || !/^(static|relative)?$/.test(s.position ?? "")
        || (s["overflow-x"] ?? "visible") !== "visible" || (s["overflow-y"] ?? "visible") !== "visible"
        || EDGES.some(edge => px(s[`margin-${edge}`]) !== 0)
        || !/^(auto|normal)?$/.test(s["align-self"] ?? "") || !intrinsicFlexText(sem, wrapping)) return;
    shrink.push(factor);
    automaticMinimum.push((s["min-width"] ?? "auto") === "auto");
  }
  for (const { node } of items) {
    const fontSettings = intrinsicFontSettingsReason(node);
    if (fontSettings) return { fontFallback: fontSettings };
  }
  return { wrapping, columnGap, rowGap, shrink, automaticMinimum };
}

/** Both emit modes share children; only app dispatch uses the intrinsic allocation. */
export function buildIntrinsicFlex(n: LayoutNode, base: SemBase, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): StackNode | undefined {
  const admitted = intrinsicFlex(n, base, items, align, distribution);
  if (!admitted) return;
  if ("fontFallback" in admitted) {
    // A declined singleton must not subsequently enter legacy intrinsic HStack packing.
    const children = items.map(({ sem }) => {
      sem.width = { kind: "fixed", px: sem.frame.w };
      sem.height = { kind: "fixed", px: sem.frame.h };
      return finish(sem);
    });
    const stack: StackNode = { ...base, padding: insetsOf(n.styles), kind: "stack", axis: "h", align, distribution,
      spacing: 0, leadInset: 0, children };
    stack.measured = measuredLayoutOf(stack, children);
    stack.notes.push(`approximated: intrinsic flex ${admitted.fontFallback} → captured child allocation; native glyph styling may differ`);
    return stack;
  }
  const children = items.map(({ node, sem }) => {
    restoreAllocatedInsets(node, sem);
    sem.width = { kind: "fill" };
    sem.height = { kind: align === "stretch" ? "fill" : "hug" };
    return finish(sem);
  });
  const stack: StackNode = { ...base, padding: insetsOf(n.styles), kind: "stack", axis: "h", align, distribution,
    spacing: admitted.columnGap, leadInset: 0, height: { kind: "hug" }, children, intrinsicFlex: admitted };
  stack.measured = measuredLayoutOf(stack, children);
  return stack;
}
