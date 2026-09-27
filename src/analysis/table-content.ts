/** Keep a cell's intrinsic content separate from its allocated row/span rectangle. */
import type { LayoutNode, Rect } from "../model/layout.ts";
import type { SemNode, TextNode } from "../model/semantic.ts";
import { px, round2 } from "../css/index.ts";
import { edgeWidth, insetsOf, unionRect } from "./geometry.ts";

export function tableCellInsets(node: LayoutNode, collapsed: boolean): SemNode["padding"] {
  const insets = insetsOf(node.styles);
  if (!collapsed) return insets;
  const edges = ["top", "right", "bottom", "left"] as const;
  return insets.map((inset, i) => inset - edgeWidth(node.styles, edges[i]!) / 2) as SemNode["padding"];
}

/** Captured glyph boxes resolve normal only for one line; explicit CSS line height is authored. */
export function tableTextContentFrame(node: LayoutNode, text: TextNode, padding: SemNode["padding"]): Rect | undefined {
  if (text.overlays.length || text.lineLimit !== undefined || text.truncate || text.maxHeight !== undefined
    || text.runs.some(run => run.gap !== undefined || run.baselineOffset !== undefined)) return;
  const first = text.runs[0]?.font;
  if (!first || text.runs.some(run => JSON.stringify(run.font) !== JSON.stringify(first))) return;
  const boxes: Rect[] = [];
  const visit = (source: LayoutNode) => {
    if (source.tag === "#text" && /\S/.test(source.text ?? "")) {
      boxes.push(...(source.lines?.length ? source.lines.map(line => line.bounds) : [source.bounds]));
    } else source.children.forEach(visit);
  };
  node.children.forEach(visit);
  if (!boxes.length || boxes.some(box => box.h <= 0)) return;
  boxes.sort((a, b) => a.y - b.y);
  const union = boxes.reduce(unionRect), lineHeight = first.lineHeight;
  let y: number, height: number;
  if (lineHeight === undefined) {
    // Font-normal height is measured from this line, never inferred from the allocated span.
    if (text.lines !== 1 || boxes.some(box => Math.abs(box.y - boxes[0]!.y) > 0.15 || Math.abs(box.h - boxes[0]!.h) > 0.15)) return;
    y = union.y; height = union.h;
  } else {
    height = text.lines * lineHeight;
    if (union.h > height + 0.15 || boxes.some(box => box.h > lineHeight + 0.15)) return;
    y = boxes[0]!.y - (lineHeight - boxes[0]!.h) / 2;
  }
  const [top, , bottom] = padding;
  const frame = { x: node.bounds.x, y: round2(y - top), w: node.bounds.w, h: round2(height + top + bottom) };
  if (frame.y < node.bounds.y - 0.15 || frame.y + frame.h > node.bounds.y + node.bounds.h + 0.15) return;
  return frame;
}

/** Captured centering slack is not authored padding or a first-child margin. */
export function restoreTableCellFlow(node: LayoutNode, content: SemNode, padding: SemNode["padding"]): void {
  if (content.kind === "text" && content.lineBox) {
    const top = content.padding[0] - padding[0], bottom = content.padding[2] - padding[2];
    content.lineBox = { ...content.lineBox, firstBaseline: round2(content.lineBox.firstBaseline + top),
      baselineToBottom: round2(content.lineBox.baselineToBottom + bottom),
      baselines: content.lineBox.baselines.map(baseline => round2(baseline + top)) };
  }
  content.padding = padding;
  if (content.kind !== "stack" || content.axis !== "v" || content.measured || content.wrap) return;
  const first = content.children[0], last = content.children.at(-1);
  const firstSource = node.children.find(source => source.id && source.id === first?.id);
  const lastSource = node.children.find(source => source.id && source.id === last?.id);
  content.leadInset = firstSource ? px(firstSource.styles["margin-top"]) : 0;
  if (lastSource) content.padding[2] += Math.max(0, px(lastSource.styles["margin-bottom"]));
}
