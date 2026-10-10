/** Semantic node base construction and confidence classification. */
import { type SemNode, type SemBase, type Diagnostic, addDiagnostic, confidenceOf } from "../model/semantic.ts";
import { type LayoutNode } from "../model/layout.ts";
import { parseDeclared } from "../css/index.ts";
import { type InferenceContext } from "./context.ts";
import { styleOf } from "./style.ts";
import { sizeOf, trailingInset } from "./sizing.ts";
import { insetsOf } from "./geometry.ts";
import { classifyElement } from "../html/policy.ts";

export function finish<T extends SemNode>(node: T): T {
  node.confidence = confidenceOf(node.diagnostics);
  return node;
}

export function withBase<T extends Partial<SemNode>>(n: LayoutNode, ctx: InferenceContext, extra: T): SemNode {
  const base = makeBase(n, ctx, parseDeclared(n.attrs["style"]));
  return finish({ ...base, ...extra } as unknown as SemNode);
}

export function makeBase(n: LayoutNode, ctx: InferenceContext, declared: Record<string, string>): SemBase {
  const diagnostics: Diagnostic[] = [];
  const policy = classifyElement(n.tag, n.attrs);
  if (policy.diagnostic) addDiagnostic(diagnostics, policy.diagnostic.level, policy.diagnostic.feature, policy.diagnostic.message);
  const style = styleOf(n, diagnostics);
  const { width, height, selfAlign, ...constraints } = sizeOf(n, declared, ctx, diagnostics);
  const padding = insetsOf(n.styles);
  padding[2] = trailingInset(n, height, padding[2]);
  return {
    id: n.id ?? "",
    frame: n.bounds,
    width,
    height,
    ...constraints,
    ...(selfAlign !== undefined ? { selfAlign } : {}),
    padding,
    style,
    confidence: "mapped",
    diagnostics,
    overlays: [],
  };
}
