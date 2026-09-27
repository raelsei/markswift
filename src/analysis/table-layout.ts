/** A bounded fixed-table model: authored track rules must reproduce every captured cell. */
import type { LayoutNode } from "../model/layout.ts";
import type { TableLayout } from "../model/table.ts";
import type { SemBase, SemNode, StackNode } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
import { px, parseDeclared } from "../css/index.ts";
import { edgeWidth, insetsOf } from "./geometry.ts";
import { makeBase, finish } from "./node-base.ts";
import { allocateTableColumns } from "./table-allocation.ts";
import { declaredTableColumns, intent, ordinary, unconstrained, spacing, close } from "./table-columns.ts";
import { readTableStructure, type TableMember } from "./table-structure.ts";
import { tableLayers } from "./table-layers.ts";

const reasons = new WeakMap<LayoutNode, string>();
export interface NativeTableAnalysis { layout: TableLayout; members: TableMember[]; collapsed: boolean }

export function buildNativeTable(table: LayoutNode, base: SemBase, ctx: InferenceContext,
  build: (node: LayoutNode, ctx: InferenceContext) => SemNode): StackNode | undefined {
  const analysis = analyzeNativeTable(table, ctx.parent);
  if (!analysis) return;
  const { fills, shadows, radius, ellipse, border, borderSides, outline, ...effects } = base.style;
  const children = analysis.members.map(({ node, placement, parent }) => {
    const childCtx: InferenceContext = { ...ctx, parent: parent ?? table, parentAxis: "h", parentDisplay: "table-row", parentAlign: "start" };
    if (placement.kind !== "cell" && placement.kind !== "caption") {
      const paint = makeBase(node, childCtx, parseDeclared(node.attrs.style));
      if (placement.kind === "body") paint.style = { fills, shadows, radius, ellipse, border, borderSides, outline };
      paint.notes = allocatedWidthNotes(paint.notes);
      return finish({ ...paint, kind: "box", padding: [0, 0, 0, 0], width: { kind: "fill" }, height: { kind: "fill" } } as SemNode);
    }
    const child = build(node, childCtx);
    child.width = { kind: "fill" };
    child.notes = allocatedWidthNotes(child.notes);
    if (placement.kind === "cell") child.height = { kind: "fill" };
    // Collapsed borders occupy half of their resolved width on each side of a cell.
    if (analysis.collapsed && placement.kind === "cell") {
      const edges = ["top", "right", "bottom", "left"] as const;
      child.padding = insetsOf(node.styles).map((inset, i) => inset - edgeWidth(node.styles, edges[i]!) / 2) as SemNode["padding"];
    }
    return child;
  });
  const notes = [...base.notes,
    "approximated: native fixed table preserves declared columns and cell spans; row heights use captured minimums and native content growth",
    "approximated: table accessibility retains cell coordinates, headers and section labels; platform table navigation and HTML headers associations are unavailable",
  ];
  if (analysis.collapsed) notes.push("approximated: collapsed table borders keep resolved cell strokes; CSS border conflict painting is not reproduced");
  if (analysis.layout.spacing.some(value => value > 0)) notes.push("approximated: table row and column background layers cover their native track regions, including border spacing");
  return finish({ ...base, style: { fills: [], shadows: [], ...effects },
    width: { kind: "fill" }, height: { kind: "hug" }, padding: [0, 0, 0, 0], notes,
    kind: "stack", axis: "v", spacing: 0, align: "start", distribution: "start", leadInset: 0,
    table: analysis.layout, children,
  });
}

/** Native table placement supplies the width for cells and decorative track layers. */
function allocatedWidthNotes(notes: string[]): string[] {
  return notes.filter(note => !note.startsWith("approximated: width:") || !note.includes("may not resize proportionally"));
}

export function tableFallbackReason(table: LayoutNode): string | undefined {
  const reason = reasons.get(table);
  return reason ? `approximated: table keeps captured geometry; ${reason}` : undefined;
}

export function analyzeNativeTable(table: LayoutNode, parent?: LayoutNode): NativeTableAnalysis | undefined {
  const decline = (reason: string) => { reasons.set(table, reason); return undefined; };
  if (table.styles["table-layout"] !== "fixed") return decline("automatic/intrinsic column allocation cannot be inferred from one capture");
  if (table.styles.display !== "table" || intent(table) !== "100%" || !ordinary(table) || !unconstrained(table)
    || intent(table, "height") !== "auto" || (parent && parent.styles.display !== "block")) {
    return decline("native allocation requires an unconstrained full-width fixed table in ordinary block flow");
  }
  if (parent) {
    const [, right, , left] = insetsOf(parent.styles);
    if (!close(table.bounds.w, parent.bounds.w - left - right)) return decline("table overflows its containing block");
  }
  const collapsed = table.styles["border-collapse"] === "collapse";
  if (!collapsed && table.styles["border-collapse"] !== "separate") return decline("border model is absent from this legacy capture");
  const gap = collapsed ? [0, 0] : spacing(table.styles["border-spacing"]);
  if (!gap) return decline("border-spacing requires resolved nonnegative pixel lengths");
  const structure = readTableStructure(table, decline);
  if (!structure) return;
  const { rows, caption, placed, count } = structure;
  const captionSide = caption?.styles["caption-side"] ?? "top";
  if (caption && (!ordinary(caption) || !unconstrained(caption) || intent(caption) !== "auto"
    || caption.styles.display !== "table-caption" || !close(caption.bounds.w, table.bounds.w)
    || !close(caption.bounds.x, table.bounds.x) || !["top", "bottom"].includes(captionSide))) {
    return decline("constrained, positioned or side captions require captured geometry");
  }
  const captionMargins: [number, number] = caption ? [px(caption.styles["margin-top"]), px(caption.styles["margin-bottom"])] : [0, 0];
  if (captionMargins.some(value => value < 0)) return decline("negative caption margins require captured geometry");
  const captionExtent = caption ? caption.bounds.h + captionMargins[0] + captionMargins[1] : 0;
  const bodyTop = table.bounds.y + (caption && captionSide === "top" ? captionExtent : 0);
  const bodyBottom = table.bounds.y + table.bounds.h - (caption && captionSide === "bottom" ? captionExtent : 0);
  const first = rows[0]!.node, last = rows.at(-1)!.node;
  const insets: TableLayout["insets"] = [first.bounds.y - bodyTop, table.bounds.x + table.bounds.w - first.bounds.x - first.bounds.w,
    bodyBottom - last.bounds.y - last.bounds.h, first.bounds.x - table.bounds.x];
  if (insets.some(value => value < -0.1)) return decline("table body extends outside its captured box");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!.node;
    if (!ordinary(row) || intent(row) !== "auto" || row.styles.display !== "table-row"
      || !close(row.bounds.x, first.bounds.x) || !close(row.bounds.w, first.bounds.w)
      || (i > 0 && !close(row.bounds.y, rows[i - 1]!.node.bounds.y + rows[i - 1]!.node.bounds.h + gap[1]!))) {
      return decline("row geometry or positioning cannot be expressed by native table tracks");
    }
  }
  const tracks = declaredTableColumns(structure.columns, count, placed, collapsed, gap, decline);
  if (!tracks) return;
  const available = table.bounds.w - insets[1] - insets[3] - gap[0]! * (count - 1);
  const widths = allocateTableColumns(tracks, available);
  if (!widths) return decline("overcommitted declared widths require browser-specific shrinking or overflow");
  for (const { node, placement: p } of placed) {
    const x = table.bounds.x + insets[3] + widths.slice(0, p.column).reduce((sum, width) => sum + width, 0) + p.column * gap[0]!;
    const w = widths.slice(p.column, p.column + p.columnSpan).reduce((sum, width) => sum + width, 0) + (p.columnSpan - 1) * gap[0]!;
    const h = rows.slice(p.row, p.row + p.rowSpan).reduce((sum, row) => sum + row.node.bounds.h, 0) + (p.rowSpan - 1) * gap[1]!;
    if (!close(node.bounds.x, x) || !close(node.bounds.w, w) || !close(node.bounds.y, rows[p.row]!.node.bounds.y) || !close(node.bounds.h, h)) {
      return decline("declared column rules or cell spans do not reproduce the captured browser geometry");
    }
  }
  const members = tableLayers(table, structure, insets, widths, gap, bodyTop, bodyBottom);
  reasons.delete(table);
  return { collapsed, members, layout: { columns: tracks, placements: members.map(member => member.placement),
    rowMinimums: rows.map(row => row.node.bounds.h), spacing: [gap[0]!, gap[1]!], insets,
    ...(caption ? { captionSide: captionSide as "top" | "bottom", captionMargins } : {}),
  } };
}
