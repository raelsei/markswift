/** Intrinsic versus fixed sizing inferred from measured content. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type Size, type Axis, type SizeConstraints, type Diagnostic, addDiagnostic } from "../model/semantic.ts";
import { round2, px } from "../css/index.ts";
import { insetsOf, renders, hangsLeading, EDGES, unionRect, mainAxis, outOfFlow } from "./geometry.ts";
import { isInlineText } from "./text-runs.ts";
import { type InferenceContext } from "./context.ts";
import { crossAlign, alignSelfOf } from "./alignment.ts";
import { constraintsOf } from "./size-constraints.ts";
import { flexGrowthSize } from "./flex-sizing.ts";

/**
 * The box's bottom inset as the browser left it: its own padding, plus the last in-flow child's
 * bottom margin when a padded box keeps it from collapsing through. A hugging box has nowhere
 * else to put that gap — a stack's spacing only lives between children — so it becomes inset.
 * Only for boxes whose children are all elements: text-node boxes are glyph areas, and their
 * line-box slack would masquerade as a margin. Capped at padding + that margin: any further
 * slack is placement (min-height, flex alignment), never padding.
 */
export function trailingInset(n: LayoutNode, height: Size, padBottom: number): number {
  if (height.kind !== "hug" || n.children.length === 0) return padBottom;
  // `<svg>` children are painted by the SVG model, not laid out in CSS flow: the gap between the
  // viewport box and the shapes' extent is the viewBox's own slack, never an uncollapsed margin.
  if (n.tag === "svg") return padBottom;
  if (n.children.some((c) => c.tag === "#text" || c.tag === "br")) return padBottom;
  const ext = contentExtent(n, false);
  if (!ext) return padBottom;
  // Bottom slack beyond the last child's margin box is not a margin: a min-height, a viewport
  // root that becomes fill-sized, flex centring, or half-leading under inline boxes. Only the
  // uncollapsed end margin belongs in the inset; everything else is placement, and folding it
  // into padding counted it twice (once as padding, once as minHeight) and froze it in app mode.
  const margins = contentExtent(n, true)!;
  const slack = n.bounds.y + n.bounds.h - (ext.y + ext.h);
  // The children's own end margins, and those collapsing through the children flush with the content bottom.
  const flush = n.children.filter((c) => c.tag !== "#text" && !outOfFlow(c) && renders(c) && Math.abs(c.bounds.y + c.bounds.h - (ext.y + ext.h)) <= 0.5);
  const margin = Math.max(0, margins.y + margins.h - (ext.y + ext.h), ...flush.map(endMargin));
  return round2(Math.max(padBottom, Math.min(slack, padBottom + margin)));
}

/**
 * A box's bottom margin plus the end margins that collapse through it: with no bottom padding
 * or border and its last child flush with its bottom edge, that child's margin ends up outside.
 * ponytail: positive margins only (CSS collapses negatives by sum); the `slack` cap above bounds any over-count.
 */
function endMargin(c: LayoutNode): number {
  const own = px(c.styles["margin-bottom"]);
  if (insetsOf(c.styles)[2] !== 0) return own;
  const bottom = c.bounds.y + c.bounds.h;
  const flush = c.children.filter((k) => k.tag !== "#text" && !outOfFlow(k) && renders(k) && Math.abs(k.bounds.y + k.bounds.h - bottom) <= 0.5);
  return Math.max(own, ...flush.map(endMargin));
}

/**
 * Union of the in-flow children's boxes (text nodes included; absolutely positioned ones and
 * markers hanging in the padding excluded, since neither takes part in the flow), optionally
 * grown by each child's margins (block/flex containers size to the margin boxes unless the end
 * margins collapse through).
 */
function contentExtent(n: LayoutNode, margins: boolean): Rect | undefined {
  const contentLeft = n.bounds.x + insetsOf(n.styles)[3];
  let r: Rect | undefined;
  for (const c of n.children) {
    if (outOfFlow(c)) continue;
    if (c.tag !== "#text") {
      if (c.bounds.w === 0 && c.bounds.h === 0) continue;
      if (!renders(c) || hangsLeading(c.bounds, contentLeft)) continue;
    }
    let box = c.bounds;
    if (margins) {
      const [mt, mr, mb, ml] = EDGES.map((e) => px(c.styles[`margin-${e}`]));
      box = { x: box.x - ml!, y: box.y - mt!, w: box.w + ml! + mr!, h: box.h + mt! + mb! };
    }
    r = r ? unionRect(r, box) : box;
  }
  return r;
}

/**
 * Does the box wrap its own content along `axis`? Both the margin-box and border-box
 * extents count (end margins may collapse through). Text-node boxes are glyph areas, not
 * line boxes, so a text host gets a line-height of slack vertically.
 */
function hugs(n: LayoutNode, axis: Axis): boolean {
  const [pt, pr, pb, pl] = insetsOf(n.styles);
  const textHost = n.children.length > 0 && n.children.every((c) => c.tag === "#text" || c.tag === "br" || isInlineText(c));
  const tol = axis === "v" && textHost ? Math.max(4, px(n.styles["line-height"])) : 1;
  for (const ext of [contentExtent(n, true), contentExtent(n, false)]) {
    const natural = axis === "h" ? (ext?.w ?? 0) + pl + pr : (ext?.h ?? 0) + pt + pb;
    if (Math.abs((axis === "h" ? n.bounds.w : n.bounds.h) - natural) <= tol) return true;
  }
  return false;
}

/**
 * Cascaded preferred width/height retain fixed-size intent; older captures use inline styles.
 * Otherwise geometry tells: parent content box → fill, own content → hug, other sizes →
 * measured pixels. Flex allocation and constraints share the same border-box contract.
 */
export function sizeOf(n: LayoutNode, d: Record<string, string>, ctx: InferenceContext, diagnostics: Diagnostic[]): SizeConstraints & { width: Size; height: Size; selfAlign?: "start" | "center" | "end"; selfAlignV?: "start" | "center" | "end" } {
  const s = n.styles;
  const abs = outOfFlow(n);
  // The child's own cross alignment (`align-self`) overrides the container's `align-items`.
  const own = ctx.parent ? alignSelfOf(n, ctx.parent) : undefined;
  const align = own ?? ctx.parentAlign;
  const placed = own !== undefined && own !== ctx.parentAlign && (own === "start" || own === "center" || own === "end") ? own : undefined;
  if (own === "baseline" && ctx.parentAlign !== "baseline") addDiagnostic(diagnostics, "approximated", "align-self", "align-self: baseline → the row's own alignment");
  const declW = n.preferredSize?.width ?? d["width"];
  const declH = n.preferredSize?.height ?? d["height"];

  const hugsW = hugs(n, "h");
  let hugsH = hugs(n, "v");
  // In a stretching flex row every child is as tall as the row, so a child equal to the box is
  // no evidence of hugging: some child must reach that height on its own content.
  if (hugsH && mainAxis(n) === "h" && crossAlign(n) === "stretch") {
    hugsH = n.children.some((c) => {
      if (c.tag === "#text" || c.tag === "br") return true;
      if (outOfFlow(c)) return false;
      const self = c.styles["align-self"] ?? "auto";
      return (self !== "auto" && self !== "normal" && self !== "stretch") || hugs(c, "v");
    });
  }
  let fillsW = false, fillsH = false;
  if (ctx.parent) {
    const [ppt, ppr, ppb, ppl] = insetsOf(ctx.parent.styles);
    const outerW = n.bounds.w + px(s["margin-left"]) + px(s["margin-right"]);
    const outerH = n.bounds.h + px(s["margin-top"]) + px(s["margin-bottom"]);
    fillsW = Math.abs(outerW - (ctx.parent.bounds.w - ppl - ppr)) <= 1;
    fillsH = Math.abs(outerH - (ctx.parent.bounds.h - ppt - ppb)) <= 1;
  }
  const measuredW: Size = { kind: "fixed", px: round2(n.bounds.w) };
  const measuredH: Size = { kind: "fixed", px: round2(n.bounds.h) };
  const growthW = flexGrowthSize(n, "h", ctx, diagnostics);
  const growthH = flexGrowthSize(n, "v", ctx, diagnostics);

  let width: Size;
  if (declW && /px$/.test(declW)) width = measuredW;
  else if (declW === "100%") width = fillsW && !abs ? { kind: "fill" } : measuredW;
  else if (growthW) width = growthW;
  else if (ctx.parentAxis === "v" && align === "stretch" && !/inline/.test(s["display"] ?? "") && !abs) {
    width = fillsW ? { kind: "fill" } : hugsW ? { kind: "hug" } : measuredW;
  } else if (hugsW || !ctx.parent) width = { kind: "hug" };
  else if (fillsW && !abs) width = { kind: "fill" };
  else width = measuredW;

  let height: Size;
  if (declH && /px$/.test(declH)) height = measuredH;
  else if (declH === "100%") height = fillsH && !abs ? { kind: "fill" } : measuredH;
  else if (growthH) height = growthH;
  else if (ctx.parentAxis === "h" && align === "stretch" && !abs && fillsH) height = { kind: "fill" };
  else if (hugsH || !ctx.parent) height = { kind: "hug" };
  else height = measuredH;

  const constraints = constraintsOf(n, d, ctx, diagnostics);

  // Horizontal margins on a block child are not part of the IR: the used `auto` margins of a
  // centred box, like plain side margins, make the margin box fill the parent while the border
  // box does not. Cap the width at what they leave and place the box the way they placed it.
  // (Computed style resolves `auto` to px, so this is geometry, not a declared property.)
  let selfAlign: "start" | "center" | "end" | undefined;
  if (width.kind === "fill" && ctx.parentAxis === "v" && !abs) {
    const ml = px(s["margin-left"]);
    const mr = px(s["margin-right"]);
    if (ml + mr > 1) {
      constraints.maxWidth = Math.min(constraints.maxWidth ?? Number.POSITIVE_INFINITY, round2(n.bounds.w));
      if (Math.abs(ml - mr) <= 1) selfAlign = "center";
      else if (ml > mr) selfAlign = "end";
    }
  }
  if (selfAlign === undefined && placed && ctx.parentAxis === "v" && !abs) selfAlign = placed;
  const selfAlignV = placed && ctx.parentAxis === "h" && !abs ? placed : undefined;
  return { width, height, ...constraints, ...(selfAlign !== undefined ? { selfAlign } : {}), ...(selfAlignV !== undefined ? { selfAlignV } : {}) };
}
