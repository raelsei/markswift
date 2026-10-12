/** Authored flex rows the runtime `MarkswiftFlexRow` reproduces, admitted only when they reproduce the capture. */
import type { LayoutNode } from "../model/layout.ts";
import type { FlexItem, FlexRow } from "../model/semantic.ts";
import { px } from "../css/index.ts";
import { insetsOf, outOfFlow } from "./geometry.ts";

/** Item widths for a content width, mirroring MarkswiftFlexRow.widths (runtime/flex-row.swift). */
export function solveFlexRow(items: FlexItem[], bases: number[], width: number, gap: number): number[] {
  const free = width - bases.reduce((a, b) => a + b, 0) - Math.max(0, items.length - 1) * gap;
  if (free >= 0) {
    const g = items.reduce((s, i) => s + i.grow, 0);
    return bases.map((b, i) => (g > 0 ? b + (free * items[i]!.grow) / Math.max(1, g) : b));
  }
  const s = items.reduce((sum, item, i) => sum + item.shrink * bases[i]!, 0);
  return bases.map((b, i) => (s > 0 ? Math.max(0, b + (free * items[i]!.shrink * b) / s) : b));
}
// ponytail: no min-width:auto (min-content) clamp and no freeze loop; admission proves the captured width,
// the probe a second width. Add the CSS freeze loop with min-content from sizeThatFits(width: 0) if rows diverge.

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
const MIN: Record<string, true> = { auto: true, "0px": true };
const BASIS = /^(auto|content|0%|\d+(\.\d+)?px)$/;

const memo = new WeakMap<LayoutNode, FlexRow | null>();

/** The admitted row, or undefined. Pure on the captured LayoutNode (also used for the probe capture). Memoised. */
export function admitFlexRow(n: LayoutNode): FlexRow | undefined {
  let row = memo.get(n);
  if (row === undefined) {
    row = admit(n) ?? null;
    memo.set(n, row);
  }
  return row ?? undefined;
}

const hasText = (n: LayoutNode): boolean =>
  n.tag === "#text" ? !!(n.text ?? "").trim() : n.children.some((c) => c.styles.display !== "none" && hasText(c));

/** Captured max-content width: in-flow descendants are text and inline elements, every text on one line. */
function maxContent(item: LayoutNode): number | undefined {
  let left = Infinity;
  let right = -Infinity;
  const walk = (n: LayoutNode): boolean =>
    n.children.every((c) => {
      if (c.tag === "#text") {
        if ((c.lines?.length ?? 0) > 1) return false;
        if (c.bounds.w > 0) {
          left = Math.min(left, c.bounds.x);
          right = Math.max(right, c.bounds.x + c.bounds.w);
        }
        return true;
      }
      if (c.styles.display === "none" || outOfFlow(c)) return true;
      return c.styles.display === "inline" && walk(c);
    });
  if (!walk(item)) return undefined;
  const [, r, , l] = insetsOf(item.styles);
  return (right > left ? right - left : 0) + r + l;
}

function admit(n: LayoutNode): FlexRow | undefined {
  const s = n.styles;
  // 1. Container.
  if (s.display !== "flex" || (s["flex-direction"] ?? "row") !== "row" || (s["flex-wrap"] ?? "nowrap") !== "nowrap")
    return undefined;
  if (s.direction === "rtl") return undefined;
  // 2. Items; a bare text run would be an anonymous item.
  if (n.children.some((c) => c.tag === "#text" && (c.text ?? "").trim())) return undefined;
  const nodes = n.children.filter((c) => c.tag !== "#text" && c.styles.display !== "none" && !outOfFlow(c));
  if (nodes.length < 2) return undefined;
  // 3–4. Per item, and its basis: border-box px (CSS adds padding and border to the flex base size), or content.
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
    if (!SELF[t["align-self"] ?? "auto"] || !MIN[t["min-width"] ?? "auto"] || (t["max-width"] ?? "none") !== "none")
      return undefined;
    const width = node.preferredSize?.width ?? "auto";
    if ((width !== "auto" && !/px$/.test(width)) || !BASIS.test(basis)) return undefined;
    const raw = /px$/.test(basis)
      ? px(basis)
      : basis === "0%"
        ? 0
        : basis === "auto" && width !== "auto"
          ? px(width)
          : undefined;
    const [, r, , l] = insetsOf(t);
    authored.push(raw);
    items.push({
      grow,
      shrink,
      basis: raw === undefined ? null : t["box-sizing"] === "border-box" ? Math.max(raw, r + l) : raw + r + l,
    });
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
  if (!c1 && !c2 && !c3) return undefined;
  // 6. Container alignment.
  const align = ALIGN[s["align-items"] ?? "normal"];
  if (!align) return undefined;
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
  // 8. CSS scales free space when the shrink sum is below 1; not mirrored.
  const shrinkSum = items.reduce((sum, i) => sum + i.shrink, 0);
  if (free < 0 && shrinkSum > 0 && shrinkSum < 1) return undefined;
  // 9. Distribution.
  if (!START[s["justify-content"] ?? "normal"] && !(free >= 0 && growth >= 1)) return undefined;
  // 10. Geometry.
  const w = solveFlexRow(items, bases, W, gap);
  let x = n.bounds.x + insets[3];
  for (const [i, node] of nodes.entries()) {
    if (!near(node.bounds.w, w[i]!) || !near(node.bounds.x, x)) return undefined;
    x += w[i]! + gap;
  }
  const fidelityNote: FlexRow["fidelityNote"] = c1
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
      : undefined;
  return { items, align, ...(fidelityNote ? { fidelityNote } : {}) };
}
