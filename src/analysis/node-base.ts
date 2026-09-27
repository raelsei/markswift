/** Semantic node base construction and confidence classification. */
import { type SemNode, type Confidence, type SemBase } from "../model/semantic.ts";
import { type LayoutNode } from "../model/layout.ts";
import { parseDeclared } from "../css/index.ts";
import { type InferenceContext } from "./context.ts";
import { styleOf } from "./style.ts";
import { sizeOf, trailingInset } from "./sizing.ts";
import { insetsOf } from "./geometry.ts";
import { classifyElement } from "../html/policy.ts";
import { markerPaintRect } from "./list-symbol.ts";
import { relativePosition } from "./relative-position.ts";
import { fieldsetMetadata } from "./fieldset-paint.ts";
import { fontSelectionDiagnostic } from "./typography.ts";

export function finish<T extends SemNode>(node: T): T {
  node.confidence = worst(node.notes);
  return node;
}

function worst(notes: string[]): Confidence {
  if (notes.some((s) => s.startsWith("unmapped"))) return "unmapped";
  if (notes.some((s) => s.startsWith("approximated"))) return "approximated";
  return "mapped";
}

export function withBase<T extends Partial<SemNode>>(n: LayoutNode, ctx: InferenceContext, extra: T): SemNode {
  const base = makeBase(n, ctx, parseDeclared(n.attrs["style"]));
  return finish({ ...base, ...extra } as unknown as SemNode);
}

export function makeBase(n: LayoutNode, ctx: InferenceContext, declared: Record<string, string>): SemBase {
  const notes: string[] = [];
  const fontDiagnostic = fontSelectionDiagnostic(n.styles, ctx.bundledFamilies);
  if (fontDiagnostic) notes.push(fontDiagnostic);
  // The root capture rebases its painted border to the viewport; its external flow slot is
  // outside the converted subtree. Descendants retain separate flow and paint positions.
  const relative = ctx.parent ? relativePosition(n) : {};
  if (relative.reason) notes.push(`approximated: relative position ${relative.reason}; captured placement cannot recompute at another width`);
  const policy = classifyElement(n.tag, n.attrs);
  if (policy.note) notes.push(policy.note);
  if ([n, ...n.children.filter(child => child.tag === "::marker")].some(marker => marker.tag === "::marker" && marker.styles.content === "normal"
    && /^(disc|circle|square|disclosure-open|disclosure-closed)$/.test(marker.styles["list-style-type"] ?? "")
    && !markerPaintRect(marker))) notes.push("approximated: default list symbol font metrics/direction are not proved; captured marker text glyph retained instead of browser shape paint");
  for (const custom of n.flattenedCustomElements ?? []) {
    notes.push(`approximated: <${custom.tag}>${custom.id ? ` #${custom.id}` : ""} display: contents wrapper has no box; custom semantics and behavior are not translated`);
  }
  const style = styleOf(n, notes);
  const { width, height, selfAlign, ...constraints } = sizeOf(n, declared, ctx, notes);
  const padding = insetsOf(n.styles);
  padding[2] = trailingInset(n, height, padding[2]);
  return {
    id: n.id ?? "",
    frame: n.bounds,
    ...(relative.offset ? { relativeOffset: relative.offset } : {}),
    width,
    height,
    ...constraints,
    ...(selfAlign !== undefined ? { selfAlign } : {}),
    padding,
    style,
    ...fieldsetMetadata(n, ctx, style, notes),
    confidence: "mapped",
    notes,
    overlays: [],
  };
}
