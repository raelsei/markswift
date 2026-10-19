/** Semantic node base construction and confidence classification. */
import { type SemNode, type SemBase, type Diagnostic, addDiagnostic, confidenceOf } from "../model/semantic.ts";
import { type LayoutNode, VALIDATION_MARK } from "../model/layout.ts";
import { parseDeclared } from "../css/index.ts";
import { type InferenceContext } from "./context.ts";
import { stateStylesOf, styleOf } from "./style.ts";
import { sizeOf, trailingInset } from "./sizing.ts";
import { insetsOf, relativeOffset, renders } from "./geometry.ts";
import { classifyElement } from "../html/policy.ts";
import { activatableAction } from "./controls.ts";
import { isInlineText, textContent } from "./text-runs.ts";
import { PSEUDO, undrawnImages } from "./generated.ts";
import { fieldOf, nameHintOf } from "./naming.ts";
import { isToggleRole } from "../model/interactive.ts";
import { motionOf, transitionsOf } from "./motion.ts";
import { titleOf } from "./tooltips.ts";

export function finish<T extends SemNode>(node: T): T {
  node.confidence = confidenceOf(node.diagnostics);
  return node;
}

export function withBase<T extends Partial<SemNode>>(n: LayoutNode, ctx: InferenceContext, extra: T): SemNode {
  const base = makeBase(n, ctx, parseDeclared(n.attrs["style"]));
  return finish({ ...base, ...extra } as unknown as SemNode);
}

const passing = new WeakMap<LayoutNode, boolean>();
/**
 * The element and every rendered element below it compute `pointer-events: none` (an `auto` descendant stays
 * hittable in CSS). `pointer-events` inherits: a child with no key and no children (a synthetic pseudo `img`,
 * `styles: {}`) passes under a `none` parent.
 */
export function passesTaps(n: LayoutNode): boolean {
  let v = passing.get(n);
  if (v === undefined)
    passing.set(
      n,
      (v =
        n.styles["pointer-events"] === "none" &&
        n.children.every(
          (c) =>
            c.tag === "#text" ||
            !renders(c) ||
            (c.styles["pointer-events"] === undefined && !c.children.length) ||
            passesTaps(c),
        )),
    );
  return v;
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
  const states = stateStylesOf(n, style);
  const transitions = transitionsOf(n, states, diagnostics);
  const motion = transitions ? { ...motionOf(n, style, diagnostics), transitions } : motionOf(n, style, diagnostics);
  // Parts that never get a view of their own: an inline pseudo-element (merged into this node's text runs) and the
  // shapes of an svg (drawn as one vector).
  const parts =
    policy.route === "svg"
      ? n.children.flatMap(function all(c): LayoutNode[] {
          return [c, ...c.children.flatMap(all)];
        })
      : n.children.filter((c) => (c.tag === "::before" || c.tag === "::after") && isInlineText(c));
  for (const c of parts)
    if (c.motion?.animations || c.motion?.reduced)
      addDiagnostic(
        diagnostics,
        "unmapped",
        "animation-name",
        `animated ${c.tag} ${policy.route === "svg" ? "inside an svg" : "is part of a text run"}; not animated`,
      );
  const { width, height, selfAlign, selfAlignV, ...constraints } = sizeOf(n, declared, ctx, diagnostics);
  const padding = insetsOf(n.styles);
  padding[2] = trailingInset(n, height, padding[2]);
  const relative = relativeOffset(n, ctx.parent);
  for (const loss of relative.losses) addDiagnostic(diagnostics, "approximated", "position: relative", loss);
  const undrawn = PSEUDO[n.tag] ? undrawnImages(n) : undefined;
  if (undrawn) addDiagnostic(diagnostics, "approximated", undrawn.feature, undrawn.message);
  const [rx, ry] = relative.offset;
  const a11y = a11yOf(n, ctx);
  // Native controls get their action in `controlOf`; everything else the design makes activatable here.
  const action = policy.route !== "control" && !style.hidden ? activatableAction(n) : undefined;
  // A Button already announces itself as one; the explicit trait only stays where no Button is emitted.
  if (action && !action.gesture && a11y?.trait === "isButton") delete a11y.trait;
  const labelFor = ctx.labels?.activates.get(n)?.id;
  const hint = nameHintOf(n.tag, n.attrs);
  const field = fieldOf(n.attrs);
  const tooltip = titleOf(n);
  const schemes = (n.styles["color-scheme"] ?? "").split(/\s+/).filter((v) => v && v !== "only");
  const changedScheme = n !== ctx.root && n.styles["color-scheme"] !== ctx.parent?.styles["color-scheme"];
  const colorScheme = changedScheme
    ? schemes.length === 1 && (schemes[0] === "light" || schemes[0] === "dark")
      ? schemes[0]
      : schemes.includes("normal") || (schemes.includes("light") && schemes.includes("dark"))
        ? "system"
        : undefined
    : undefined;
  return {
    id: n.id ?? "",
    frame: n.bounds,
    width,
    height,
    ...constraints,
    ...(selfAlign !== undefined ? { selfAlign } : {}),
    ...(selfAlignV !== undefined ? { selfAlignV } : {}),
    ...(rx || ry ? { relativeOffset: relative.offset } : {}),
    ...(colorScheme ? { colorScheme } : {}),
    padding,
    style,
    confidence: "mapped",
    diagnostics,
    overlays: [],
    ...(a11y && Object.keys(a11y).length ? { a11y } : {}),
    ...(action ? { action } : {}),
    ...(hint ? { nameHint: hint } : {}),
    ...(field ? { field } : {}),
    ...(labelFor ? { labelFor } : {}),
    ...(states ? { states } : {}),
    ...(motion ? { motion } : {}),
    ...(passesTaps(n) ? { hitTesting: false as const } : {}),
    ...(tooltip ? { tooltip } : {}),
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
  if (isToggleRole(role)) out.toggle = true;
  const group = role === "radio" ? ctx.labels?.radioGroups.get(n) : undefined;
  if (group !== undefined) out.group = group;
  if (a["aria-disabled"] === "true") out.disabled = true;
  if (a["aria-hidden"] === "true") out.hidden = true;
  const tag = /^h([1-6])$/.exec(n.tag);
  const level = tag ? Number(tag[1]) : role === "heading" ? parseInt(a["aria-level"] ?? "", 10) || 2 : undefined;
  if (level !== undefined) out.heading = Math.min(6, Math.max(1, level)) as NonNullable<typeof out.heading>;
  if (role === "button" && n.tag !== "button") out.trait = "isButton";
  else if (role === "link" && n.tag !== "a") out.trait = "isLink";
  else if (role === "img") out.trait = "isImage";
  else if (n.tag === "th" || role === "columnheader" || role === "rowheader") out.trait = "isHeader";
  return Object.keys(out).length ? out : undefined;
}
