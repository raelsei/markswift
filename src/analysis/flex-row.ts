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
// ponytail: min-width:auto is the captured min-content for unbreakable content (`unbreakableWidth`), else the box's
// padding and border; breakable text is probed natively (`autoMin`, runtime `sizeThatFits` at width 0).

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
const ALIGN_CONTENT: Record<string, FlexRow["alignContent"]> = {
  stretch: "stretch",
  "flex-start": "start",
  start: "start",
  "flex-end": "end",
  end: "end",
  center: "center",
  "space-between": "between",
  "space-around": "around",
  "space-evenly": "evenly",
};
const START: Record<string, true> = { normal: true, "flex-start": true, start: true };
const SELF: Record<string, true> = { auto: true, normal: true };
const PX = /^\d+(\.\d+)?px$/;
const PCT = /^\d+(\.\d+)?%$/;
const BASIS = /^(auto|content|\d+(\.\d+)?(px|%))$/;

/**
 * `align-content` line distribution in a taller cross axis, mirroring `MarkswiftFlexRow.alignContentDistribution`
 * (runtime/flex-row.swift).
 */
export function flexAlignContent(
  alignContent: NonNullable<FlexRow["alignContent"]>,
  lineCrossSizes: number[],
  availableCross: number,
  gap: number,
): { offsets: number[]; lineCrossSizes: number[] } {
  const count = lineCrossSizes.length;
  const total = lineCrossSizes.reduce((a, b) => a + b, 0) + Math.max(0, count - 1) * gap;
  const slack = availableCross - total;
  const offsets: number[] = [];
  let sizes = [...lineCrossSizes];
  if (count <= 1 || slack <= 0.5) {
    let y = 0;
    for (const s of lineCrossSizes) {
      offsets.push(y);
      y += s + gap;
    }
    return { offsets, lineCrossSizes: sizes };
  }
  switch (alignContent) {
    case "start": {
      let y = 0;
      for (const s of lineCrossSizes) {
        offsets.push(y);
        y += s + gap;
      }
      break;
    }
    case "end": {
      let y = slack;
      for (const s of lineCrossSizes) {
        offsets.push(y);
        y += s + gap;
      }
      break;
    }
    case "center": {
      let y = slack / 2;
      for (const s of lineCrossSizes) {
        offsets.push(y);
        y += s + gap;
      }
      break;
    }
    case "between": {
      const extra = slack / (count - 1);
      let y = 0;
      for (const s of lineCrossSizes) {
        offsets.push(y);
        y += s + gap + extra;
      }
      break;
    }
    case "around": {
      const unit = slack / count;
      let y = unit / 2;
      for (const s of lineCrossSizes) {
        offsets.push(y);
        y += s + gap + unit;
      }
      break;
    }
    case "evenly": {
      const unit = slack / (count + 1);
      let y = unit;
      for (const s of lineCrossSizes) {
        offsets.push(y);
        y += s + gap + unit;
      }
      break;
    }
    case "stretch": {
      const extra = slack / count;
      sizes = lineCrossSizes.map((s) => s + extra);
      let y = 0;
      for (const s of sizes) {
        offsets.push(y);
        y += s + gap;
      }
      break;
    }
  }
  return { offsets, lineCrossSizes: sizes };
}
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
  const direction = s["flex-direction"] ?? "row";
  if (s.display !== "flex" || (direction !== "row" && direction !== "column") || (wrap !== "nowrap" && wrap !== "wrap"))
    return undefined;
  if (s.direction === "rtl") return undefined;
  const isCol = direction === "column";
  if (isCol && wrap !== "nowrap") return undefined;
  // 2. Items; a bare text run would be an anonymous item.
  if (n.children.some((c) => c.tag === "#text" && (c.text ?? "").trim())) return undefined;
  const nodes = n.children.filter((c) => c.tag !== "#text" && c.styles.display !== "none" && !outOfFlow(c));
  if (nodes.length < 2) return undefined;
  const wraps = wrap === "wrap";
  const rowGap =
    s["row-gap"] === undefined || s["row-gap"] === "normal" ? 0 : PX.test(s["row-gap"]) ? px(s["row-gap"]) : NaN;
  if (wraps && Number.isNaN(rowGap)) return undefined;
  // A column requires a definite or minimum height so flex allocation has space to distribute.
  const hPref = n.preferredSize?.height ?? "auto";
  const hMin = s["min-height"] ?? "auto";
  const colDefinite = (hPref !== "auto" && PX.test(hPref)) || (hMin !== "auto" && hMin !== "0px" && PX.test(hMin));
  if (isCol && !colDefinite) return undefined;
  // A wrapping row distributes lines using align-content when declared.
  const rawAlignContent = s["align-content"];
  const alignContent = rawAlignContent && rawAlignContent !== "normal" ? ALIGN_CONTENT[rawAlignContent] : undefined;
  if (wraps && rawAlignContent && rawAlignContent !== "normal" && !alignContent) return undefined;
  const insets = insetsOf(s);
  const mainGap = isCol ? px(s["row-gap"]) : px(s["column-gap"]);
  const mainAvailable = isCol ? n.bounds.h - insets[0] - insets[2] : n.bounds.w - insets[1] - insets[3];
  const crossAvailable = isCol ? n.bounds.w - insets[1] - insets[3] : n.bounds.h - insets[0] - insets[2];

  // 3–4. Per item, and its basis: border-box px (CSS adds padding and border to the flex base size), a percentage
  // of the container, or content.
  const items: FlexItem[] = [];
  const authored: Array<number | undefined> = [];
  for (const node of nodes) {
    const t = node.styles;
    const basis = t["flex-basis"];
    if (t["flex-grow"] === undefined || t["flex-shrink"] === undefined || basis === undefined) return undefined;
    const grow = Number(t["flex-grow"]);
    const shrink = Number(t["flex-shrink"]);
    if (!Number.isFinite(grow) || !Number.isFinite(shrink)) return undefined;
    if (isCol) {
      if (px(t["margin-top"]) !== 0 || px(t["margin-bottom"]) !== 0 || px(t.order) !== 0) return undefined;
    } else {
      if (px(t["margin-left"]) !== 0 || px(t["margin-right"]) !== 0 || px(t.order) !== 0) return undefined;
    }
    const self = t["align-self"] ?? "auto";
    if (!SELF[self] && !ALIGN[self]) return undefined;
    const mainProp = isCol ? (node.preferredSize?.height ?? "auto") : (node.preferredSize?.width ?? "auto");
    if ((mainProp !== "auto" && !PX.test(mainProp) && !PCT.test(mainProp)) || !BASIS.test(basis)) return undefined;
    const pct = PCT.test(basis) ? basis : basis === "auto" && PCT.test(mainProp) ? mainProp : undefined;
    const fraction = pct && pct !== "0%" ? Number.parseFloat(pct) / 100 : undefined;
    if (fraction !== undefined) {
      if (isCol) {
        if (px(t["padding-top"]) !== 0 || px(t["padding-bottom"]) !== 0) return undefined;
      } else {
        if (px(t["padding-left"]) !== 0 || px(t["padding-right"]) !== 0) return undefined;
      }
    }
    const raw = PX.test(basis) ? px(basis) : pct ? 0 : basis === "auto" && PX.test(mainProp) ? px(mainProp) : undefined;
    const [pt, pr, pb, pl] = insetsOf(t);
    const inset = isCol ? pt + pb : pr + pl;
    const box = t["box-sizing"] === "border-box";
    const item: FlexItem = {
      grow,
      shrink,
      basis: raw === undefined ? null : box ? Math.max(raw, fraction === undefined ? inset : 0) : raw + inset,
    };
    if (!SELF[self]) item.align = ALIGN[self];
    const min = isCol ? (t["min-height"] ?? "auto") : (t["min-width"] ?? "auto");
    const max = isCol ? (t["max-height"] ?? "none") : (t["max-width"] ?? "none");
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
    // A clipping item's automatic minimum is 0 (css-flexbox §4.5); otherwise the runtime probes min-content.
    const clips = (node.styles[isCol ? "overflow-y" : "overflow-x"] ?? "visible") !== "visible";
    if (hasText(node) && !clips && unbreakableWidth(node) === undefined && min === "auto") item.autoMin = true;
    authored.push(raw);
    items.push(item);
  }
  // 5. Candidates.
  const growth = items.reduce((sum, i) => sum + i.grow, 0);
  const factors = items.filter((i) => i.grow > 0).map((i) => i.grow);
  const mainSizes = nodes.filter((_, i) => items[i]!.grow > 0).map((g) => (isCol ? g.bounds.h : g.bounds.w));
  const fill =
    growth >= 1 &&
    factors.every((g) => Math.abs(g - factors[0]!) < 0.000001) &&
    Math.max(...mainSizes) - Math.min(...mainSizes) <= 1;
  const c1 = factors.length > 0 && !fill;
  const shrinkable = items.map((item, i) => (authored[i] ?? 0) > 0 && item.shrink > 0);
  const c2 = nodes.some((node, i) => shrinkable[i] && (isCol ? node.bounds.h : node.bounds.w) < items[i]!.basis! - 0.5);
  const c3 = shrinkable.includes(true) && nodes.some((node, i) => items[i]!.basis === null && hasText(node));
  const c4 = items.some((i) => i.fraction !== undefined);
  const c5 = isCol && (c1 || c2 || c4 || (growth > 0 && !fill));
  const candidate = c1 || c2 || c3 || c4 || (wraps && !isCol) || c5;
  // 6. Container alignment.
  const align = ALIGN[s["align-items"] ?? "normal"];
  if (!align) return undefined;
  for (const item of items) if (item.align === align) delete item.align;
  // 7. Content bases.
  const content = nodes.map((node, i) => {
    if (items[i]!.basis !== null) return undefined;
    return isCol ? node.bounds.h : maxContent(node);
  });
  const bases = nodes.map((node, i) => items[i]!.basis ?? content[i] ?? (isCol ? node.bounds.h : node.bounds.w));
  const free = mainAvailable - bases.reduce((a, b) => a + b, 0) - (nodes.length - 1) * mainGap;
  const unprovable = nodes.some((_, i) => items[i]!.basis === null && content[i] === undefined);
  const still =
    growth === 0 &&
    nodes.every((node, i) => items[i]!.basis === null || near(isCol ? node.bounds.h : node.bounds.w, items[i]!.basis!));
  if (unprovable && !still) return undefined;
  // 8. Distribution.
  const clamped = items.some((i) => i.min !== undefined || i.max !== undefined || i.fraction !== undefined);
  const start = START[s["justify-content"] ?? "normal"];
  if (!start && (wraps || !(free >= 0 && growth >= 1 && !clamped))) return undefined;
  // Automatic minimums of a container whose bases overflow.
  const overflowing = free < -0.5;
  for (const [i, node] of nodes.entries()) {
    const item = items[i]!;
    const minProp = isCol ? (node.styles["min-height"] ?? "auto") : (node.styles["min-width"] ?? "auto");
    if (!overflowing || minProp !== "auto") continue;
    const mainProp = isCol ? (node.preferredSize?.height ?? "auto") : (node.preferredSize?.width ?? "auto");
    const solid = isCol ? node.bounds.h : unbreakableWidth(node);
    const auto = solid === undefined ? undefined : PX.test(mainProp) ? Math.min(solid, item.basis ?? solid) : solid;
    if (auto !== undefined && auto > (item.inset ?? 0) + 0.5) item.min = Math.round(auto * 100) / 100;
  }
  // 9. Geometry.
  if (isCol) {
    const hAlloc = solveFlexRow(items, bases, mainAvailable, mainGap);
    let y = n.bounds.y + insets[0];
    for (const [k, node] of nodes.entries()) {
      if (!near(node.bounds.h, hAlloc[k]!) || !near(node.bounds.y, y)) return undefined;
      const a = items[k]?.align ?? align;
      let expectedW = node.bounds.w;
      let expectedX = n.bounds.x + insets[3];
      if (a === "stretch") expectedW = crossAvailable;
      else if (a === "center") expectedX += (crossAvailable - node.bounds.w) / 2;
      else if (a === "end") expectedX += crossAvailable - node.bounds.w;
      if (!near(node.bounds.w, expectedW) || !near(node.bounds.x, expectedX)) return undefined;
      y += hAlloc[k]! + mainGap;
    }
  } else {
    const lines: Array<[number, number]> = wraps
      ? flexLines(items, bases, mainAvailable, mainGap)
      : [[0, nodes.length]];
    const lineHeights = lines.map(([a, b]) => Math.max(...nodes.slice(a, b).map((c) => c.bounds.h)));
    const totalLineHeights = lineHeights.reduce((a, b) => a + b, 0) + Math.max(0, lines.length - 1) * rowGap;
    const slack = crossAvailable - totalLineHeights;
    const hasHeightConstraint = (n.preferredSize?.height ?? "auto") !== "auto" || (hMin !== "auto" && hMin !== "0px");
    // Without declared align-content, a wrapping row must hug its content: a height constraint leaves unprovable slack.
    if (wraps && hasHeightConstraint && (alignContent === undefined || slack <= 0.5)) return undefined;

    const distribution = alignContent
      ? flexAlignContent(alignContent, lineHeights, crossAvailable, rowGap)
      : { offsets: lines.map(() => 0), lineCrossSizes: lineHeights };
    let naturalY = n.bounds.y + insets[0];
    for (const [lineIdx, [a, b]] of lines.entries()) {
      const w = solveFlexRow(items.slice(a, b), bases.slice(a, b), mainAvailable, mainGap);
      const line = nodes.slice(a, b);
      let x = n.bounds.x + insets[3];
      const lineY = alignContent ? n.bounds.y + insets[0] + distribution.offsets[lineIdx]! : naturalY;
      const lineH = distribution.lineCrossSizes[lineIdx]!;
      for (const [k, node] of line.entries()) {
        if (!near(node.bounds.w, w[k]!) || !near(node.bounds.x, x)) return undefined;
        x += w[k]! + mainGap;
      }
      if (!wraps) continue;
      const lineTop = Math.min(...line.map((c) => c.bounds.y));
      if (!near(lineTop, lineY)) return undefined;
      if (line.some((c) => c.bounds.y < lineY - 1 || c.bounds.y + c.bounds.h > lineY + lineH + 1)) return undefined;
      naturalY += lineH + rowGap;
    }
  }
  const fidelityNote: FlexRow["fidelityNote"] = wraps
    ? {
        feature: "flex-wrap",
        message:
          "wrapping flex allocation pinned to captured positions in fidelity mode; app mode reflows it with MarkswiftFlexRow",
      }
    : isCol
      ? {
          feature: "flex-column",
          message:
            "column flex allocation pinned to captured heights in fidelity mode; app mode reflows it with MarkswiftFlexRow",
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
  return {
    row: {
      items,
      align,
      ...(isCol ? { axis: "v" } : {}),
      ...(wraps ? { rowGap, ...(alignContent ? { alignContent } : {}) } : {}),
      ...(fidelityNote ? { fidelityNote } : {}),
    },
    candidate: candidate || (overflowing && items.some((i) => i.min !== undefined)),
  };
}
