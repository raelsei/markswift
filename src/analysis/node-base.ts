/** Semantic node base construction and confidence classification. */
import { type SemNode, type Confidence, type SemBase } from "../model/semantic.ts";
import { type LayoutNode } from "../model/layout.ts";
import { parseDeclared } from "../css/index.ts";
import { type InferenceContext } from "./context.ts";
import { styleOf } from "./style.ts";
import { sizeOf, trailingInset } from "./sizing.ts";
import { insetsOf } from "./geometry.ts";
import { classifyElement } from "../html/policy.ts";

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
  const policy = classifyElement(n.tag, n.attrs);
  if (policy.note) notes.push(policy.note);
  const style = styleOf(n, notes);
  const { width, height, maxWidth, selfAlign } = sizeOf(n, declared, ctx, notes);
  const padding = insetsOf(n.styles);
  padding[2] = trailingInset(n, height, padding[2]);
  return {
    id: n.id ?? "",
    frame: n.bounds,
    width,
    height,
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(selfAlign !== undefined ? { selfAlign } : {}),
    padding,
    style,
    confidence: "mapped",
    notes,
    overlays: [],
  };
}
