/** Semantic node base construction and confidence classification. */
import { type SemNode, type SemBase, type Diagnostic, addDiagnostic, confidenceOf } from "../model/semantic.ts";
import { type LayoutNode, VALIDATION_MARK } from "../model/layout.ts";
import { parseDeclared } from "../css/index.ts";
import { type InferenceContext } from "./context.ts";
import { styleOf } from "./style.ts";
import { sizeOf, trailingInset } from "./sizing.ts";
import { insetsOf } from "./geometry.ts";
import { classifyElement } from "../html/policy.ts";
import { activatableAction } from "./controls.ts";
import { textContent } from "./text-runs.ts";

/** Roles whose element AT announces as a toggle. */
const TOGGLE_ROLES: Readonly<Record<string, true>> = {
  checkbox: true,
  switch: true,
  radio: true,
  menuitemcheckbox: true,
  menuitemradio: true,
};

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
  // Native controls get their action in `controlOf`; everything else the design makes activatable here.
  const action = policy.route !== "control" && !style.hidden ? activatableAction(n) : undefined;
  // A Button already announces itself as one; the explicit trait only stays where no Button is emitted.
  if (action && !action.gesture && a11y?.trait === "isButton") delete a11y.trait;
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
    ...(a11y && Object.keys(a11y).length ? { a11y } : {}),
    ...(action ? { action } : {}),
    ...(labelFor ? { labelFor } : {}),
  };
}

/** ARIA attributes, the `<label>` naming a control, and heading tags; undefined when the element says nothing beyond itself. */
function a11yOf(n: LayoutNode, ctx: InferenceContext): SemBase["a11y"] {
  const a = n.attrs;
  const out: NonNullable<SemBase["a11y"]> = {};
  const role = a["role"]?.trim().toLowerCase();
  const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const byIds = (ids: string | undefined) =>
    clean(
      clean(ids)
        .split(" ")
        .map((id) => (id ? textContent(ctx.labels?.byId.get(id)) : ""))
        .join(" "),
    );
  // accname order: aria-labelledby, then aria-label, then the <label>.
  const label = byIds(a["aria-labelledby"]) || clean(a["aria-label"]) || ctx.labels?.text.get(n);
  if (label) out.label = label;
  const hint = byIds(a["aria-describedby"]) || clean(a["aria-description"]);
  if (hint) out.hint = hint;
  const value =
    clean(a["aria-valuetext"]) ||
    clean(a["aria-valuenow"]) ||
    (a["aria-checked"] === "mixed"
      ? "mixed"
      : a["aria-expanded"] === "true"
        ? "expanded"
        : a["aria-expanded"] === "false"
          ? "collapsed"
          : "");
  if (value) out.value = value;
  if (
    [a["aria-selected"], a["aria-checked"], a["aria-pressed"]].includes("true") ||
    (a["aria-current"] !== undefined && a["aria-current"] !== "false")
  )
    out.selected = true;
  if (role && Object.hasOwn(TOGGLE_ROLES, role)) out.toggle = true;
  if (a["aria-disabled"] === "true") out.disabled = true;
  if (a["aria-hidden"] === "true") out.hidden = true;
  const tag = /^h([1-6])$/.exec(n.tag);
  const level = tag ? Number(tag[1]) : role === "heading" ? parseInt(a["aria-level"] ?? "", 10) || 2 : undefined;
  if (level !== undefined) out.heading = Math.min(6, Math.max(1, level)) as NonNullable<typeof out.heading>;
  if (role === "button" && n.tag !== "button") out.trait = "isButton";
  else if (role === "link" && n.tag !== "a") out.trait = "isLink";
  else if (role === "img") out.trait = "isImage";
  return Object.keys(out).length ? out : undefined;
}
