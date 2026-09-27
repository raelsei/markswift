import type { SemNode, StackNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { indent, num, str } from "./format.ts";
import { modifiers } from "./modifiers.ts";
import { tableIntrinsicExpr } from "./table-intrinsic.ts";
import { geometryAlias } from "./geometry-observation.ts";
import { tableTextContent } from "./table-content.ts";

export function tableExpr(node: StackNode, ctx: EmitContext): string[] {
  const table = node.table!;
  const columns = table.columns.map(column => `.init(kind: ${column.kind === "fixed" ? 0 : column.kind === "fraction" ? 1 : 2}, value: ${num(column.value ?? 0)}, extra: ${num(column.extra ?? 0)})`);
  const placements = table.placements.map(p => `.init(kind: ${p.kind === "cell" ? 0 : p.kind === "body" ? 2 : p.kind === "caption" ? 3 : 1}, cell: .init(row: ${p.row}, column: ${p.column}, rowSpan: ${p.rowSpan}, columnSpan: ${p.columnSpan}))`);
  const [top, right, bottom, left] = table.insets;
  const out = ctx.mode === "fidelity" ? [
    `MarkswiftMeasuredLayout(width: ${num(node.frame.w)}, height: ${num(node.frame.h)}, frames: [`,
    ...node.children.map(child => `    CGRect(x: ${num(child.frame.x - node.frame.x)}, y: ${num(child.frame.y - node.frame.y)}, width: ${num(child.frame.w)}, height: ${num(child.frame.h)}),`),
    "]) {",
  ] : [`MarkswiftTableLayout(columns: [${columns.join(", ")}], placements: [`,
    ...placements.map(placement => `    ${placement},`),
    `], rowMinimums: [${table.rowMinimums.map(num).join(", ")}], columnGap: ${num(table.spacing[0])}, rowGap: ${num(table.spacing[1])},`,
    `    insets: EdgeInsets(top: ${num(top)}, leading: ${num(left)}, bottom: ${num(bottom)}, trailing: ${num(right)}), capturedWidth: ${num(node.frame.w)},`,
    `    captionBottom: ${table.captionSide === "bottom"}, captionMargins: [${(table.captionMargins ?? [0, 0]).map(num).join(", ")}], fixedRows: false${table.mode === "auto" ? `, intrinsic: [${table.intrinsic!.map(tableIntrinsicExpr).join(", ")}]` : ""}) {`];
  node.children.forEach((child, index) => {
    const placement = table.placements[index]!;
    let lines: string[];
    if (placement.kind === "cell") {
      // Place the padded content first, then paint the full allocated cell rectangle.
      const content: SemNode = { ...child, height: { kind: "hug" }, style: { fills: [], shadows: [] }, overlays: [] };
      if (content.kind === "text" && placement.contentFrame) tableTextContent(content, placement.contentFrame);
      ctx.geometry?.suppressed.add(content);
      lines = ctx.renderNode(content).split("\n");
      const horizontal = child.kind === "text" ? child.align : "leading";
      const vertical = placement.alignment ?? "center";
      const alignment = vertical === "center" ? horizontal === "center" ? ".center" : horizontal === "trailing" ? ".trailing" : ".leading"
        : `.${vertical}${horizontal === "center" ? "" : horizontal === "trailing" ? "Trailing" : "Leading"}`;
      lines.push(`.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: ${alignment})`);
      const cellPaint: SemNode = { ...child, width: { kind: "hug" }, height: { kind: "hug" }, padding: [0, 0, 0, 0] };
      geometryAlias(cellPaint, child, ctx.geometry);
      lines.push(...modifiers(cellPaint, ctx));
      if (ctx.mode === "app") {
        lines.push(`.accessibilityElement(children: .${interactive(child) ? "contain" : "combine"})`);
        const section = placement.section === "thead" ? "Header section, " : placement.section === "tfoot" ? "Footer section, " : "";
        const span = placement.rowSpan > 1 || placement.columnSpan > 1 ? `, spans ${placement.rowSpan} rows and ${placement.columnSpan} columns` : "";
        lines.push(`.accessibilityHint(${str(`${section}Row ${placement.row + 1}, column ${placement.column + 1}${span}`)})`);
        if (placement.header) lines.push(".accessibilityAddTraits(.isHeader)");
      }
    } else {
      lines = ctx.renderNode(child).split("\n");
      if (placement.kind !== "caption") lines.push(".accessibilityHidden(true)", ".allowsHitTesting(false)");
      else if (ctx.mode === "fidelity") lines.push(`.frame(height: ${num(child.frame.h)}, alignment: .topLeading)`);
      else lines.push(`.accessibilitySortPriority(${table.captionSide === "bottom" ? -1 : 1})`);
    }
    out.push(...indent(lines, 1));
  });
  out.push("}");
  if (ctx.mode === "app") {
    out.push(".accessibilityElement(children: .contain)");
    out.push(`.accessibilityLabel(${str(`Table, ${table.rowMinimums.length} rows, ${table.columns.length} columns`)})`);
  }
  return out;
}

function interactive(node: SemNode): boolean {
  return node.kind === "control" || ((node.kind === "stack" || node.kind === "grid") && node.children.some(interactive));
}
