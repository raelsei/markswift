/** Bounded native row reflow; unsupported flex algorithms retain captured positions. */
import type { LayoutNode } from "../model/layout.ts";
import { type Axis, type CrossAlign, type Distribution, type SemBase, type StackNode, addDiagnostic } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { parseDeclared, px, resolveLength, round2 } from "../css/index.ts";
import { insetsOf, renders, EDGES, unionRect } from "./geometry.ts";
import { linesOf } from "./flow-layout.ts";
import { measuredLayoutOf, paintOrder } from "./measured-layout.ts";

function gap(value: string | undefined): number | undefined {
  if (!value || value === "normal") return 0;
  return /^(?:0|\d*\.?\d+px)$/.test(value) ? Math.max(0, px(value)) : undefined;
}

function unsupported(n: LayoutNode, base: SemBase, items: AnalyzedChild[], axis: Axis, align: CrossAlign, distribution: Distribution, columnGap: number | undefined, rowGap: number | undefined): string | undefined {
  const direction = n.styles["flex-direction"] ?? "row";
  if (axis !== "h" || direction !== "row") return `${direction} wrapping`;
  if (n.styles["flex-wrap"] !== "wrap") return "wrap-reverse";
  if (n.styles.direction === "rtl") return "RTL wrapping";
  if (!["start", "center", "end"].includes(distribution)) return `justify-content ${n.styles["justify-content"]}`;
  if (!["start", "center", "end", "stretch"].includes(align)) return `align-items ${n.styles["align-items"]}`;
  if (columnGap === undefined || rowGap === undefined) return "relative or complex row/column gaps";

  for (const item of items) {
    const s = item.node.styles;
    // A capture can fit perfectly while a narrower native proposal activates CSS shrinking.
    if (px(s["flex-grow"]) > 0 || px(s["flex-shrink"] ?? "1") > 0) return "flex grow/shrink allocation";
    if (align === "stretch") {
      const declaredHeight = item.node.preferredSize?.height ?? parseDeclared(item.node.attrs.style)["height"];
      const [pt, , pb] = insetsOf(s);
      const wanted = declaredHeight && /^(?:0|\d*\.?\d+px)$/.test(declaredHeight) ? resolveLength(declaredHeight, 0) : undefined;
      if (wanted === undefined || Math.abs(item.sem.frame.h - wanted - (s["box-sizing"] === "border-box" ? 0 : pt + pb)) > 1) return "stretch-dependent child heights";
    }
    if (item.sem.width.kind !== "fixed" || item.sem.height.kind !== "fixed") return "intrinsic or filling child sizes";
    if (EDGES.some(edge => Math.abs(px(s[`margin-${edge}`])) > 0.5)) return "child margins";
    if (![undefined, "", "auto", "normal"].includes(s["align-self"])) return `align-self ${s["align-self"]}`;
    if (px(s.order) !== 0) return "CSS order allocation";
    const preferred = item.node.preferredSize?.width ?? parseDeclared(item.node.attrs.style)["width"];
    const basis = s["flex-basis"];
    const mainSize = basis && basis !== "auto" && basis !== "content" ? basis : preferred;
    if (mainSize && mainSize !== "auto" && !/^(?:0|\d*\.?\d+px)$/.test(mainSize)) return "relative or intrinsic child width";
  }

  const lines = linesOf(items);
  const rows = lines.map(line => line.map(item => item.sem.frame).reduce(unionRect));
  const contentWidth = Math.max(0, base.frame.w - base.padding[1] - base.padding[3]);
  const nativeLines: AnalyzedChild[][] = [];
  let nativeLine: AnalyzedChild[] = [], usedWidth = 0;
  for (const item of lines.flat()) {
    const next = usedWidth + (nativeLine.length ? columnGap : 0) + item.sem.frame.w;
    if (nativeLine.length && next > contentWidth + 0.0001) {
      nativeLines.push(nativeLine);
      nativeLine = [];
      usedWidth = 0;
    }
    usedWidth += (nativeLine.length ? columnGap : 0) + item.sem.frame.w;
    nativeLine.push(item);
  }
  if (nativeLine.length) nativeLines.push(nativeLine);
  if (nativeLines.length !== lines.length || nativeLines.some((line, index) => line.length !== lines[index]!.length)) return "ambiguous main-axis wrapping";
  const naturalHeight = rows.reduce((sum, row) => sum + row.h, 0) + Math.max(0, rows.length - 1) * rowGap;
  const contentHeight = Math.max(0, base.frame.h - base.padding[0] - base.padding[2]);
  const alignContent = n.styles["align-content"] ?? "normal";
  const preferredHeight = n.preferredSize?.height ?? parseDeclared(n.attrs.style)["height"];
  const boundedHeight = base.height.kind !== "hug" || base.minHeight !== undefined || base.maxHeight !== undefined
    || (preferredHeight !== undefined && preferredHeight !== "auto");
  // A resize can create cross-row slack even when the captured rows exactly fill the host.
  if ((boundedHeight || Math.abs(contentHeight - naturalHeight) > 1) && alignContent !== "start" && alignContent !== "flex-start") return `align-content ${alignContent} in a non-hugging host`;
  let y = base.frame.y + base.padding[0];
  for (const [index, row] of rows.entries()) {
    if (Math.abs(row.y - y) > 1) return "ambiguous cross-row placement";
    const line = lines[index]!;
    const width = line.reduce((sum, item) => sum + item.sem.frame.w, 0) + Math.max(0, line.length - 1) * columnGap;
    let x = base.frame.x + base.padding[3] + (distribution === "center" ? (contentWidth - width) / 2 : distribution === "end" ? contentWidth - width : 0);
    for (const item of line) {
      const top = y + (align === "center" ? (row.h - item.sem.frame.h) / 2 : align === "end" ? row.h - item.sem.frame.h : 0);
      if (Math.abs(item.sem.frame.x - x) > 1 || Math.abs(item.sem.frame.y - top) > 1) return "ambiguous child alignment";
      x += item.sem.frame.w + columnGap;
    }
    y += row.h + rowGap;
  }
  return undefined;
}

export function buildWrapping(n: LayoutNode, base: SemBase, all: AnalyzedChild[], axis: Axis, align: CrossAlign, distribution: Distribution): StackNode {
  // Wrapping owns its whole content box. Trailing alignment slack is geometry, never padding.
  const plain: SemBase = { ...base, padding: insetsOf(n.styles) };
  const items = all.filter(item => renders(item.node));
  const columnGap = gap(n.styles["column-gap"]), rowGap = gap(n.styles["row-gap"]);
  const reason = unsupported(n, plain, items, axis, align, distribution, columnGap, rowGap);
  const ordered = reason ? paintOrder(items) : linesOf(items).flat();
  const stack: StackNode = { ...plain, kind: "stack", axis, align, distribution, spacing: columnGap ?? 0, leadInset: 0, children: ordered.map(item => item.sem) };
  if (reason) {
    stack.measured = measuredLayoutOf(plain, stack.children);
    addDiagnostic(stack.diagnostics, "approximated", "flex-wrap", `flex-wrap ${reason} → captured child positions; cannot reflow at another size`);
  } else {
    stack.wrap = { columnGap: round2(columnGap!), rowGap: round2(rowGap!) };
  }
  return stack;
}
