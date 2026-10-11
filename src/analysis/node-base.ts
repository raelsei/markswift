/** Semantic node base construction and confidence classification. */
import { type SemNode, type SemBase, type Diagnostic, addDiagnostic, confidenceOf } from "../model/semantic.ts";
import { type LayoutNode, VALIDATION_MARK } from "../model/layout.ts";
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
  if (policy.diagnostic)
    addDiagnostic(diagnostics, policy.diagnostic.level, policy.diagnostic.feature, policy.diagnostic.message);
  if (n.attrs[VALIDATION_MARK] !== undefined)
    addDiagnostic(
      diagnostics,
      "approximated",
      ":invalid",
      "validation styling (:invalid/:valid rule) captured as the resting look; it does not follow the field's value",
    );
  const style = styleOf(n, diagnostics);
  const { width, height, selfAlign, selfAlignV, ...constraints } = sizeOf(n, declared, ctx, diagnostics);
  const padding = insetsOf(n.styles);
  padding[2] = trailingInset(n, height, padding[2]);
  const a11y = a11yOf(n, ctx);
  const labelFor = ctx.labels?.activates.get(n)?.id;
  return {
    id: n.id ?? "",
    frame: n.bounds,
    width,
    height,
    ...constraints,
    ...(selfAlign !== undefined ? { selfAlign } : {}),
    ...(selfAlignV !== undefined ? { selfAlignV } : {}),
    padding,
    style,
    confidence: "mapped",
    diagnostics,
    overlays: [],
    ...(a11y ? { a11y } : {}),
    ...(labelFor ? { labelFor } : {}),
  };
}

/** ARIA attributes, the `<label>` naming a control, and heading tags; undefined when the element says nothing beyond itself. */
function a11yOf(n: LayoutNode, ctx: InferenceContext): SemBase["a11y"] {
  const a = n.attrs;
  const out: NonNullable<SemBase["a11y"]> = {};
  // ARIA wins over the `<label>`.
  const label = a["aria-label"]?.replace(/\s+/g, " ").trim() || ctx.labels?.text.get(n);
  if (label) out.label = label;
  if (a["aria-hidden"] === "true") out.hidden = true;
  const role = a["role"]?.trim().toLowerCase();
  const tag = /^h([1-6])$/.exec(n.tag);
  const level = tag ? Number(tag[1]) : role === "heading" ? parseInt(a["aria-level"] ?? "", 10) || 2 : undefined;
  if (level !== undefined) out.heading = Math.min(6, Math.max(1, level)) as NonNullable<typeof out.heading>;
  if (role === "button" && n.tag !== "button") out.trait = "isButton";
  else if (role === "link" && n.tag !== "a") out.trait = "isLink";
  else if (role === "img") out.trait = "isImage";
  return Object.keys(out).length ? out : undefined;
}
