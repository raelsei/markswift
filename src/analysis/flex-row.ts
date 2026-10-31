/** Authored flex rows the runtime `MarkswiftFlexRow` reproduces, admitted only when they reproduce the capture. */
import type { LayoutNode } from "../model/layout.ts";
import type { FlexItem, FlexRow } from "../model/semantic.ts";
import { px } from "../css/index.ts";
import { insetsOf, outOfFlow } from "./geometry.ts";

/**
 * Item widths for a content width, mirroring MarkswiftFlexRow.widths (runtime/flex-row.swift): CSS's flex freeze
 * loop (css-flexbox §9.7) with min/max clamps, shrink weighted by the inner basis and factor sums below 1.
 * `bases`: each item's px basis (the px part for a percentage basis, resolved here against `width`).
 */
export function solveFlexRow(items: FlexItem[], bases: number[], width: number, gap: number): number[] {
  const inset = items.map((i) => i.inset ?? 0);
  const clamp = (v: number, i: number) =>
    Math.max(items[i]!.min ?? 0, inset[i]!, Math.min(items[i]!.max ?? Infinity, v));
  const base = bases.map((b, i) => {
    const f = items[i]!.fraction;
    return f === undefined ? b : Math.max(inset[i]!, b + f * width);
  });
  const space = width - Math.max(0, items.length - 1) * gap;
  const growing = base.reduce((sum, b, i) => sum + clamp(b, i), 0) < space;
  const factor = (i: number) => (growing ? items[i]!.grow : items[i]!.shrink);
  const weight = (i: number) => (growing ? items[i]!.grow : items[i]!.shrink * Math.max(0, base[i]! - inset[i]!));
  const size = base.map(clamp);
  const frozen = base.map((b, i) => factor(i) === 0 || (growing ? b > size[i]! : b < size[i]!));
  const left = () => space - base.reduce((sum, b, i) => sum + (frozen[i] ? size[i]! : b), 0);
  const initial = left();
  // Each pass freezes at least one item; the bound only stops a non-finite measure from looping.
  for (let pass = 0; pass <= items.length && frozen.includes(false); pass++) {
    let free = left();
    const open = items.map((_, i) => i).filter((i) => !frozen[i]);
    const factors = open.reduce((sum, i) => sum + factor(i), 0);
    if (factors < 1 && Math.abs(initial * factors) < Math.abs(free)) free = initial * factors;
    const total = open.reduce((sum, i) => sum + weight(i), 0);
    const violation = open.map((i) => {
      const target = base[i]! + (total > 0 ? (free * weight(i)) / total : 0);
      size[i] = clamp(target, i);
      return size[i]! - target;
    });
    const sum = violation.reduce((a, b) => a + b, 0);
    for (const [k, i] of open.entries())
      if (Math.abs(sum) < 0.000001 || (sum > 0 ? violation[k]! > 0 : violation[k]! < 0)) frozen[i] = true;
  }
  return size;
}

/**
 * Line breaks of a `flex-wrap: wrap` row (css-flexbox §9.3), mirroring MarkswiftFlexRow.lines: an item starts a new
 * line when its clamped base (its hypothetical main size) no longer fits after the previous ones and their gaps.
 */
export function flexLines(items: FlexItem[], bases: number[], width: number, gap: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  let used = 0;
  for (const [i, b] of bases.entries()) {
    const it = items[i]!;
    const inset = it.inset ?? 0;
    const base = it.fraction === undefined ? b : Math.max(inset, b + it.fraction * width);
    const size = Math.max(it.min ?? 0, inset, Math.min(it.max ?? Infinity, base));
    const next = i === start ? size : used + gap + size;
    if (i > start && next > width + 0.01) {
      out.push([start, i]);
      start = i;
      used = size;
    } else used = next;
  }
  if (start < bases.length) out.push([start, bases.length]);
  return out;
}
// ponytail: min-width:auto is the captured min-content only for unbreakable content (`unbreakableWidth`), else the
// box's padding and border; admission proves the captured width, the probe a second width. Measure min-content
// natively if rows with wrapping text diverge.

const near = (a: number, b: number) => Math.abs(a - b) <= 1;
const ALIGN: Record<string, FlexRow["align"]> = {
  normal: "stretch",
  stretch: "stretch",
  "flex-start": "start",
  start: "start",
  center: "center",
  "flex-end": "end",
  end: "end",
};
const START: Record<string, true> = { normal: true, "flex-start": true, start: true };
const SELF: Record<string, true> = { auto: true, normal: true };
const PX = /^\d+(\.\d+)?px$/;
const PCT = /^\d+(\.\d+)?%$/;
const BASIS = /^(auto|content|\d+(\.\d+)?(px|%))$/;

const memo = new WeakMap<LayoutNode, { row: FlexRow; candidate: boolean } | null>();

/**
 * The admitted row, or undefined. Pure on the captured LayoutNode, memoised. `atProbe` skips the candidate gate
 * (step 5): a probe capture verifies the solver, and at another width the native HStack may suffice (unshrunk items).
 */
export function admitFlexRow(n: LayoutNode, atProbe = false): FlexRow | undefined {
  let found = memo.get(n);
  if (found === undefined) {
    found = admit(n) ?? null;
    memo.set(n, found);
  }
  return found && (found.candidate || atProbe) ? found.row : undefined;
}

const hasText = (n: LayoutNode): boolean =>
  n.tag === "#text" ? !!(n.text ?? "").trim() : n.children.some((c) => c.styles.display !== "none" && hasText(c));

/**
 * Captured max-content width: every in-flow descendant sits on one line (single-line text, inline elements, or boxes
 * whose own content does not wrap), so the captured extent is the content's natural width.
 */
function maxContent(item: LayoutNode): number | undefined {
  let left = Infinity;
  let right = -Infinity;
  const extend = (b: LayoutNode["bounds"]) => {
    if (b.w <= 0) return;
    left = Math.min(left, b.x);
    right = Math.max(right, b.x + b.w);
  };
  const oneLine = (n: LayoutNode): boolean =>
    n.children.every((c) =>
      c.tag === "#text"
        ? (c.lines?.length ?? 0) <= 1
        : c.styles.display === "none" || outOfFlow(c) || (c.tag !== "svg" ? oneLine(c) : true),
    );
  const walk = (n: LayoutNode): boolean =>
    n.children.every((c) => {
      if (c.tag === "#text") {
        if ((c.lines?.length ?? 0) > 1) return false;
        extend(c.bounds);
        return true;
      }
      if (c.styles.display === "none" || outOfFlow(c)) return true;
      if (c.styles.display === "inline") return walk(c);
      // An atomic box (inline-flex badge, icon button) that keeps its content on one line spans its own border box.
      if (!oneLine(c)) return false;
      extend(c.bounds);
      return true;
    });
  if (!walk(item)) return undefined;
  const [, r, , l] = insetsOf(item.styles);
  return (right > left ? right - left : 0) + r + l;
}

/**
 * CSS's automatic minimum (css-flexbox §4.5) where the capture proves it: content without a break opportunity (one
 * word per text run, or `white-space: nowrap`/`pre`) is as wide at min-content as at max-content. A clipping item
 * (`overflow` other than visible) has none.
 */
function unbreakableWidth(item: LayoutNode): number | undefined {
  if ((item.styles["overflow-x"] ?? "visible") !== "visible" || !hasText(item)) return undefined;
  const nowrap = (n: LayoutNode) => /^(nowrap|pre)$/.test(n.styles["white-space"] ?? "");
  const solid = (n: LayoutNode): boolean =>
    n.children.every((c) =>
      c.tag === "#text"
        ? nowrap(c) || !/\S\s+\S/.test((c.text ?? "").trim())
        : c.styles.display === "none" || (c.styles.display === "inline" && solid(c)),
    );
  return nowrap(item) || solid(item) ? maxContent(item) : undefined;
}

function admit(n: LayoutNode): { row: FlexRow; candidate: boolean } | undefined {
  const s = n.styles;
  // 1. Container.
  const wrap = s["flex-wrap"] ?? "nowrap";
  if (s.display !== "flex" || (s["flex-direction"] ?? "row") !== "row" || (wrap !== "nowrap" && wrap !== "wrap"))
    return undefined;
  if (s.direction === "rtl") return undefined;
  // 2. Items; a bare text run would be an anonymous item.
  if (n.children.some((c) => c.tag === "#text" && (c.text ?? "").trim())) return undefined;
  const nodes = n.children.filter((c) => c.tag !== "#text" && c.styles.display !== "none" && !outOfFlow(c));
  if (nodes.length < 2) return undefined;
  const wraps = wrap === "wrap";
  const rowGap =
    s["row-gap"] === undefined || s["row-gap"] === "normal" ? 0 : PX.test(s["row-gap"]) ? px(s["row-gap"]) : NaN;
  if (wraps && Number.isNaN(rowGap)) return undefined;
  // Lines stack from the top only in a box as tall as they are: a definite or minimum height leaves align-content
  // free space to distribute at another width.
  const minHeight = s["min-height"] ?? "auto";
  if (wraps && ((n.preferredSize?.height ?? "auto") !== "auto" || (minHeight !== "auto" && minHeight !== "0px")))
    return undefined;
  // 3–4. Per item, and its basis: border-box px (CSS adds padding and border to the flex base size), a percentage
  // of the row, or content. px min/max-width clamp a definite basis; on a content basis SwiftUI's measure would
  // already include them.
  const items: FlexItem[] = [];
  const authored: Array<number | undefined> = [];
  for (const node of nodes) {
    const t = node.styles;
    const basis = t["flex-basis"];
    if (t["flex-grow"] === undefined || t["flex-shrink"] === undefined || basis === undefined) return undefined;
    const grow = Number(t["flex-grow"]);
    const shrink = Number(t["flex-shrink"]);
    if (!Number.isFinite(grow) || !Number.isFinite(shrink)) return undefined;
    if (px(t["margin-left"]) !== 0 || px(t["margin-right"]) !== 0 || px(t.order) !== 0) return undefined;
    const self = t["align-self"] ?? "auto";
    if (!SELF[self] && !ALIGN[self]) return undefined;
    const width = node.preferredSize?.width ?? "auto";
    if ((width !== "auto" && !PX.test(width) && !PCT.test(width)) || !BASIS.test(basis)) return undefined;
    const pct = PCT.test(basis) ? basis : basis === "auto" && PCT.test(width) ? width : undefined;
    const fraction = pct && pct !== "0%" ? Number.parseFloat(pct) / 100 : undefined;
    // A percentage padding resolves against the row too, but the capture holds only its px.
    if (fraction !== undefined && (px(t["padding-left"]) !== 0 || px(t["padding-right"]) !== 0)) return undefined;
    const raw = PX.test(basis) ? px(basis) : pct ? 0 : basis === "auto" && PX.test(width) ? px(width) : undefined;
    const [, r, , l] = insetsOf(t);
    const inset = r + l;
    const box = t["box-sizing"] === "border-box";
    // A border-box basis is floored at the padding and border; a percentage's floor is applied once resolved.
    const item: FlexItem = {
      grow,
      shrink,
      basis: raw === undefined ? null : box ? Math.max(raw, fraction === undefined ? inset : 0) : raw + inset,
    };
    if (!SELF[self]) item.align = ALIGN[self];
    const min = t["min-width"] ?? "auto";
    const max = t["max-width"] ?? "none";
    if (min !== "auto" && min !== "0px") {
      if (!PX.test(min) || item.basis === null) return undefined;
      if (px(min) + (box ? 0 : inset) > inset) item.min = px(min) + (box ? 0 : inset);
    }
    if (max !== "none") {
      if (!PX.test(max) || item.basis === null) return undefined;
      item.max = Math.max(item.min ?? 0, inset, px(max) + (box ? 0 : inset));
    }
    if (inset > 0) item.inset = inset;
    if (fraction !== undefined) item.fraction = fraction;
    authored.push(raw);
    items.push(item);
  }
  // 5. Candidates; rows the native HStack already handles stay native.
  const growth = items.reduce((sum, i) => sum + i.grow, 0);
  const factors = items.filter((i) => i.grow > 0).map((i) => i.grow);
  const widths = nodes.filter((_, i) => items[i]!.grow > 0).map((g) => g.bounds.w);
  const fill =
    growth >= 1 &&
    factors.every((g) => Math.abs(g - factors[0]!) < 0.000001) &&
    Math.max(...widths) - Math.min(...widths) <= 1;
  const c1 = factors.length > 0 && !fill;
  // A px basis that can shrink (a 0 basis has no flex base size to shrink).
  const shrinkable = items.map((item, i) => (authored[i] ?? 0) > 0 && item.shrink > 0);
  const c2 = nodes.some((node, i) => shrinkable[i] && node.bounds.w < items[i]!.basis! - 0.5);
  const c3 = shrinkable.includes(true) && nodes.some((node, i) => items[i]!.basis === null && hasText(node));
  // A percentage basis follows the row; the HStack would pin it.
  const c4 = items.some((i) => i.fraction !== undefined);
  // A wrapping row has no native counterpart that re-allocates each line: MarkswiftFlexRow reflows it.
  const candidate = c1 || c2 || c3 || c4 || wraps;
  // 6. Container alignment.
  const align = ALIGN[s["align-items"] ?? "normal"];
  if (!align) return undefined;
  for (const item of items) if (item.align === align) delete item.align;
  // 7. Content bases.
  const insets = insetsOf(s);
  const W = n.bounds.w - insets[1] - insets[3];
  const gap = px(s["column-gap"]);
  const content = nodes.map((node, i) => (items[i]!.basis === null ? maxContent(node) : undefined));
  const bases = nodes.map((node, i) => items[i]!.basis ?? content[i] ?? node.bounds.w);
  const free = W - bases.reduce((a, b) => a + b, 0) - (nodes.length - 1) * gap;
  const unprovable = nodes.some((_, i) => items[i]!.basis === null && content[i] === undefined);
  const still =
    growth === 0 && nodes.every((node, i) => items[i]!.basis === null || near(node.bounds.w, items[i]!.basis!));
  if (unprovable && !still) return undefined;
  // 8. Distribution: only start packing is mirrored, unless the row fills (grow ≥ 1, nothing clamped) at any width;
  // a wrapping row's lines may not all grow, so it packs at the start.
  const clamped = items.some((i) => i.min !== undefined || i.max !== undefined || i.fraction !== undefined);
  const start = START[s["justify-content"] ?? "normal"];
  if (!start && (wraps || !(free >= 0 && growth >= 1 && !clamped))) return undefined;
  // Automatic minimums of a row its bases overflow, capped by a px width (the specified size suggestion). A row with
  // room keeps its native content sizing: captured minimums would mix Chrome's text widths into native allocation.
  const overflowing = free < -0.5;
  for (const [i, node] of nodes.entries()) {
    const item = items[i]!;
    if (!overflowing || (node.styles["min-width"] ?? "auto") !== "auto") continue;
    const width = node.preferredSize?.width ?? "auto";
    const solid = unbreakableWidth(node);
    const auto = solid === undefined ? undefined : PX.test(width) ? Math.min(solid, item.basis ?? solid) : solid;
    if (auto !== undefined && auto > (item.inset ?? 0) + 0.5) item.min = Math.round(auto * 100) / 100;
  }
  // 9. Geometry: each line from the row's left edge, lines stacked from its top (no align-content distribution).
  const lines: Array<[number, number]> = wraps ? flexLines(items, bases, W, gap) : [[0, nodes.length]];
  let y = n.bounds.y + insets[0];
  for (const [a, b] of lines) {
    const w = solveFlexRow(items.slice(a, b), bases.slice(a, b), W, gap);
    const line = nodes.slice(a, b);
    let x = n.bounds.x + insets[3];
    for (const [k, node] of line.entries()) {
      if (!near(node.bounds.w, w[k]!) || !near(node.bounds.x, x)) return undefined;
      x += w[k]! + gap;
    }
    if (!wraps) continue;
    const height = Math.max(...line.map((c) => c.bounds.h));
    if (line.some((c) => c.bounds.y < y - 1 || c.bounds.y + c.bounds.h > y + height + 1)) return undefined;
    y += height + rowGap;
  }
  const fidelityNote: FlexRow["fidelityNote"] = wraps
    ? {
        feature: "flex-wrap",
        message:
          "wrapping flex allocation pinned to captured positions in fidelity mode; app mode reflows it with MarkswiftFlexRow",
      }
    : c1
      ? {
          feature: "flex-grow",
          message:
            "unequal flex allocation pinned to captured widths in fidelity mode; app mode reflows it with MarkswiftFlexRow",
        }
      : c2
        ? {
            feature: "flex-shrink",
            message:
              "shrunk flex items pinned to captured widths in fidelity mode; app mode reflows them with MarkswiftFlexRow",
          }
        : c4
          ? {
              feature: "flex-basis",
              message:
                "percentage flex bases pinned to captured widths in fidelity mode; app mode reflows them with MarkswiftFlexRow",
            }
          : undefined;
  // A row held open by its items' minimums overflows; the HStack would squeeze them instead.
  return {
    row: { items, align, ...(wraps ? { rowGap } : {}), ...(fidelityNote ? { fidelityNote } : {}) },
    candidate: candidate || (overflowing && items.some((i) => i.min !== undefined)),
  };
}
