import type { LayoutNode } from "../model/layout.ts";
import type { AllocationTrack } from "../model/allocation.ts";
import type { CrossAlign, Distribution, SemNode } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { insetsOf } from "./geometry.ts";
import { parseDeclared, px } from "../css/syntax.ts";
import { flexAllocatedWidths } from "./allocation.ts";
import { equalCalculatedFlexWidth } from "./responsive-width.ts";

/** Numeric computed values are safe; used width pixels are not evidence of an auto basis. */
export function fixedLength(value: string | undefined): number | undefined {
  return value !== undefined && /^(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/.test(value.trim())
    && (value.trim().endsWith("px") || Number(value) === 0) ? Number.parseFloat(value) : undefined;
}

export function zeroAutomaticMinimum(n: LayoutNode): boolean {
  return fixedLength(n.styles["min-width"]) === 0
    || ((n.styles["min-width"] ?? "auto") === "auto" && (/^(hidden|auto|scroll)$/.test(n.styles["overflow-x"] ?? "")
      || (n.children.length === 0 && /^(div|span|article|section|main|aside|nav|header|footer|p)$/.test(n.tag))));
}

export function automaticHeight(n: LayoutNode): boolean {
  return (n.preferredSize?.height ?? parseDeclared(n.attrs.style).height ?? "auto") === "auto";
}

export function hasAutoMargins(n: LayoutNode): boolean {
  return n.preferredSize?.hasAutoMargins === true
    || Object.entries(parseDeclared(n.attrs.style)).some(([property, value]) => property.startsWith("margin") && /\bauto\b/.test(value));
}

/** Keep the existing all-width calc identity before an explicit-basis fallback can pin it. */
export function equalCalculatedAllocation(n: LayoutNode, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): boolean {
  if (items.length < 2 || distribution !== "start" || align === "baseline" || n.styles.direction === "rtl"
    || !/^(horizontal-tb)?$/.test(n.styles["writing-mode"] ?? "")
    || (n.styles.display === "inline-flex" && (n.preferredSize?.width ?? "auto") === "auto")) return false;
  const rawGap = n.styles["column-gap"] ?? n.styles.gap;
  if (rawGap !== undefined && rawGap !== "normal" && fixedLength(rawGap) === undefined) return false;
  const ctx = { root: n, parent: n, parentAxis: "h" as const, parentDisplay: n.styles.display ?? "flex", bundledFamilies: {}, fixed: [] };
  return items.every(({ node: child }) => !hasAutoMargins(child) && n.children.includes(child)
    && child.preferredSize?.width !== undefined && equalCalculatedFlexWidth(child, child.preferredSize.width, ctx));
}

/** A lone intrinsic text item can keep native packing beside non-shrinking fixed items. */
export function intrinsicFlexFlow(n: LayoutNode, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): boolean {
  if (!items.length || !/^(start|center|end)$/.test(distribution) || align === "baseline"
    || (n.styles["flex-direction"] ?? "row") !== "row" || n.styles.direction === "rtl"
    || !/^(horizontal-tb)?$/.test(n.styles["writing-mode"] ?? "")
    || (n.styles.display === "inline-flex" && (n.preferredSize?.width ?? "auto") === "auto")) return false;
  const rawGap = n.styles["column-gap"] ?? n.styles.gap;
  if (rawGap !== undefined && rawGap !== "normal" && fixedLength(rawGap) === undefined) return false;
  let intrinsicItems = 0;
  return items.every(({ node: child, sem }) => {
    if (!n.children.includes(child) || Number(child.styles["flex-grow"] ?? 0) !== 0 || hasAutoMargins(child)
      || ["left", "right", "top", "bottom"].some(edge => px(child.styles[`margin-${edge}`]) !== 0)
      || !/^(auto|0(?:px)?)$/.test(child.styles["min-width"] ?? "auto")
      || (child.styles["max-width"] ?? "none") !== "none") return false;
    // Relative positioning with auto/zero offsets does not change flex placement.
    if (!/^(static|relative)?$/.test(child.styles.position ?? "")
      || ["left", "right", "top", "bottom"].some(edge => {
        const value = child.styles[edge];
        return value !== undefined && value !== "auto" && fixedLength(value) !== 0;
      })) return false;
    const self = child.styles["align-self"];
    if (self && !/^(auto|normal)$/.test(self) && self !== n.styles["align-items"]) return false;
    const declared = parseDeclared(child.attrs.style);
    const basis = child.preferredSize?.flexBasis ?? child.styles["flex-basis"] ?? declared["flex-basis"] ?? "auto";
    const width = child.preferredSize?.width ?? declared.width ?? "auto";
    const shrink = Number(child.styles["flex-shrink"] ?? 1);
    if (sem.width.kind === "fixed" && shrink === 0 && fixedLength(width) !== undefined) {
      return basis === "auto" || fixedLength(basis) !== undefined;
    }
    if (sem.kind !== "text" || sem.width.kind !== "hug" || sem.lines !== 1
      || basis !== "auto" || width !== "auto" || (shrink !== 0 && shrink !== 1)) return false;
    return ++intrinsicItems <= 1;
  });
}

/** Cross-axis stretching is not bottom padding; keep only actual insets and end margins. */
export function restoreAllocatedInsets(n: LayoutNode, sem: SemNode): void {
  if (!automaticHeight(n)) return;
  const actual = insetsOf(n.styles);
  if (sem.kind === "text") sem.padding = actual;
  else if (sem.kind === "stack" && sem.axis === "v") {
    const flow = n.children.filter(child => child.tag !== "#text" && child.styles.display !== "none"
      && !/^(absolute|fixed)$/.test(child.styles.position ?? ""));
    const end = flow.sort((a, b) => (b.bounds.y + b.bounds.h) - (a.bounds.y + a.bounds.h))[0];
    sem.padding[2] = Math.min(sem.padding[2], actual[2] + Math.max(0, px(end?.styles["margin-bottom"])));
  }
}

export function flexAllocation(n: LayoutNode, items: AnalyzedChild[], align: CrossAlign, distribution: Distribution): { tracks?: AllocationTrack[]; reason?: string } {
  if (!items.some(item => px(item.node.styles["flex-grow"]) > 0 || px(item.node.styles["flex-shrink"]) > 0)) return {};
  if ((n.styles["flex-direction"] ?? "row") !== "row" || n.styles.direction === "rtl"
    || !/^(horizontal-tb)?$/.test(n.styles["writing-mode"] ?? "")) return { reason: "reverse, vertical or RTL flow" };
  if (n.styles.display === "inline-flex" && (n.preferredSize?.width ?? parseDeclared(n.attrs.style).width ?? "auto") === "auto") {
    return { reason: "intrinsic inline-flex container width" };
  }
  if (align === "baseline" || distribution !== "start") return { reason: "main-axis distribution or baseline alignment" };
  const [pt, pr, pb, pl] = insetsOf(n.styles);
  const rawGap = n.styles["column-gap"];
  const gap = rawGap === undefined || rawGap === "normal" ? 0 : fixedLength(rawGap);
  if (gap === undefined) return { reason: "relative or intrinsic gap" };
  const tracks: AllocationTrack[] = [];
  for (const { node: child } of items) {
    if (!n.children.includes(child) || child.tag === "#text") return { reason: "anonymous flex item" };
    if (hasAutoMargins(child)) return { reason: "auto item margins" };
    if (["left", "right", "top", "bottom"].some(edge => px(child.styles[`margin-${edge}`]) !== 0)) return { reason: "item margins" };
    if (!/^(auto|normal|stretch|flex-start|start|center|flex-end|end)?$/.test(child.styles["align-self"] ?? "")) return { reason: "item alignment" };
    const self = child.styles["align-self"];
    if (self && !/^(auto|normal)$/.test(self) && self !== n.styles["align-items"] && !(self === "stretch" && align === "stretch")) return { reason: "mixed cross-axis alignment" };
    if (child.styles["aspect-ratio"] && child.styles["aspect-ratio"] !== "auto") return { reason: "aspect-ratio sizing" };
    const [, cpr, , cpl] = insetsOf(child.styles), inset = cpr + cpl;
    const declared = parseDeclared(child.attrs.style);
    let rawBasis = child.preferredSize?.flexBasis ?? child.styles["flex-basis"] ?? declared["flex-basis"];
    if (rawBasis === "auto") rawBasis = child.preferredSize?.width ?? declared.width;
    const basis = /^(?:0%|0px|0)$/.test(rawBasis ?? "") ? 0 : fixedLength(rawBasis);
    if (basis === undefined) return { reason: `intrinsic or percentage flex-basis ${rawBasis ?? "auto"}` };
    const borderBox = child.styles["box-sizing"] === "border-box";
    const minRaw = child.styles["min-width"] ?? "auto", maxRaw = child.styles["max-width"] ?? "none";
    const zeroMinimum = zeroAutomaticMinimum(child);
    const min = zeroMinimum ? 0 : fixedLength(minRaw);
    const max = maxRaw === "none" ? undefined : fixedLength(maxRaw);
    if (min === undefined || (maxRaw !== "none" && max === undefined)) return { reason: "automatic, intrinsic or percentage width constraint" };
    const minimum = zeroMinimum ? inset : Math.max(inset, min + (borderBox ? 0 : inset));
    const maximum = max === undefined ? undefined : Math.max(minimum, max + (borderBox ? 0 : inset));
    const grow = fixedLength(child.styles["flex-grow"] ? `${child.styles["flex-grow"]}px` : "0px");
    const shrink = fixedLength(child.styles["flex-shrink"] ? `${child.styles["flex-shrink"]}px` : "1px");
    if (grow === undefined || shrink === undefined) return { reason: "invalid flex factor" };
    tracks.push({ basis: Math.max(inset, basis + (borderBox ? 0 : inset)), grow, shrink, min: minimum, ...(maximum !== undefined ? { max: maximum } : {}), inset });
  }
  const available = n.bounds.w - pl - pr - Math.max(0, tracks.length - 1) * gap;
  const widths = flexAllocatedWidths(available, tracks);
  let x = n.bounds.x + pl;
  const contentH = n.bounds.h - pt - pb;
  const valid = items.every((item, i) => {
    const frame = item.sem.frame;
    const width = widths[i]!;
    const y = n.bounds.y + pt + (align === "center" ? (contentH - frame.h) / 2 : align === "end" ? contentH - frame.h : 0);
    const agrees = Math.abs(frame.x - x) <= 0.5 && Math.abs(frame.w - width) <= 0.5 && Math.abs(frame.y - y) <= 0.5;
    x += width + gap;
    return agrees;
  });
  return valid ? { tracks } : { reason: "captured sizes or placement disagree with explicit allocation" };
}
