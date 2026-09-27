/** Intrinsic versus fixed sizing inferred from measured content. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type Size, type Axis, type SizeConstraints } from "../model/semantic.ts";
import { round2, px } from "../css/index.ts";
import { insetsOf, renders, hangsLeading, EDGES, unionRect } from "./geometry.ts";
import { isInlineText } from "./text-runs.ts";
import { type InferenceContext } from "./context.ts";
import { crossAlign, distributionOf } from "./alignment.ts";
import { constraintsOf } from "./size-constraints.ts";
import { flexGrowthSize } from "./flex-sizing.ts";
import { equalCalculatedFlexWidth, responsiveFraction } from "./responsive-width.ts";
import { hasEqualFixedTableWidth } from "./table-width.ts";
import { flowBounds } from "./relative-position.ts";
import { horizontalAutoAlignment } from "./auto-margins.ts";

/**
 * The box's bottom inset as the browser left it: its own padding, plus the last in-flow child's
 * bottom margin when a padded box keeps it from collapsing through. A hugging box has nowhere
 * else to put that gap — a stack's spacing only lives between children — so it becomes inset.
 * Only for boxes whose children are all elements: text-node boxes are glyph areas, and their
 * line-box slack would masquerade as a margin.
 */
export function trailingInset(n: LayoutNode, height: Size, padBottom: number): number {
  if (height.kind !== "hug" || n.children.length === 0) return padBottom;
  // `<svg>` children are painted by the SVG model, not laid out in CSS flow: the gap between the
  // viewport box and the shapes' extent is the viewBox's own slack, never an uncollapsed margin.
  if (n.tag === "svg") return padBottom;
  if (n.children.some((c) => c.tag === "#text" || c.tag === "br")) return padBottom;
  const ext = contentExtent(n, false);
  if (!ext) return padBottom;
  let inset = n.bounds.y + n.bounds.h - (ext.y + ext.h);
  const display = n.styles["display"] ?? "block";
  const row = /^row/.test(n.styles["flex-direction"] ?? "row");
  const verticalAlignment = row ? crossAlign(n, "h") : distributionOf(n.styles["justify-content"], display);
  if (/flex/.test(display) && (row ? verticalAlignment === "center" || verticalAlignment === "end" : verticalAlignment !== "start")) {
    // Center/end alignment and distributed flex gaps already place the children. Turning the
    // remaining bottom space into padding applies that placement a second time, notably on a
    // viewport root that becomes fill-sized after inference. Only its real end margin remains.
    const margins = contentExtent(n, true)!;
    const free = n.bounds.y + n.bounds.h - padBottom - (margins.y + margins.h);
    inset -= Math.max(0, free);
  }
  return round2(Math.max(padBottom, inset));
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
    const pos = c.styles["position"];
    if (pos === "absolute" || pos === "fixed") continue;
    if (c.tag !== "#text") {
      if (c.bounds.w === 0 && c.bounds.h === 0) continue;
      if (!renders(c) || hangsLeading(flowBounds(c), contentLeft)) continue;
    }
    let box = flowBounds(c);
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
export function sizeOf(n: LayoutNode, d: Record<string, string>, ctx: InferenceContext, notes: string[]): SizeConstraints & { width: Size; height: Size; selfAlign?: "center" | "end" } {
  const s = n.styles;
  const abs = s["position"] === "absolute" || s["position"] === "fixed";
  const declW = n.preferredSize?.width ?? d["width"];
  const declH = n.preferredSize?.height ?? d["height"];

  const hugsW = hugs(n, "h");
  let hugsH = hugs(n, "v");
  // In a stretching flex row every child is as tall as the row, so a child equal to the box is
  // no evidence of hugging: some child must reach that height on its own content.
  if (hugsH && /flex/.test(s["display"] ?? "") && /^row/.test(s["flex-direction"] ?? "row") && crossAlign(n, "h") === "stretch") {
    hugsH = n.children.some((c) => {
      if (c.tag === "#text" || c.tag === "br") return true;
      const pos = c.styles["position"];
      if (pos === "absolute" || pos === "fixed") return false;
      const self = c.styles["align-self"] ?? "auto";
      return (self !== "auto" && self !== "normal" && self !== "stretch") || hugs(c, "v");
    });
  }
  let fillsW = false, fillsH = false;
  if (ctx.parent) {
    const [ppt, ppr, ppb, ppl] = insetsOf(ctx.parent.styles);
    // Used auto margins consume the block slot's spare width, not the element's painted box.
    // Counting them as content turns a max-content/hugging child into a filling one.
    const autoMargins = n.preferredSize?.horizontalAutoMargins;
    const outerW = n.bounds.w + (autoMargins?.[0] ? 0 : px(s["margin-left"])) + (autoMargins?.[1] ? 0 : px(s["margin-right"]));
    const outerH = n.bounds.h + px(s["margin-top"]) + px(s["margin-bottom"]);
    fillsW = Math.abs(outerW - (ctx.parent.bounds.w - ppl - ppr)) <= 1;
    fillsH = Math.abs(outerH - (ctx.parent.bounds.h - ppt - ppb)) <= 1;
  }
  const measuredW: Size = { kind: "fixed", px: round2(n.bounds.w) };
  const measuredH: Size = { kind: "fixed", px: round2(n.bounds.h) };
  const growthW = flexGrowthSize(n, "h", ctx, notes);
  const growthH = flexGrowthSize(n, "v", ctx, notes);
  const fractionW = declW ? responsiveFraction(n, declW, ctx) : undefined;
  const sharedFlexW = declW ? equalCalculatedFlexWidth(n, declW, ctx) : false;

  let width: Size;
  if (hasEqualFixedTableWidth(ctx.root, n)) width = { kind: "fill" };
  else if (declW && /px$/.test(declW)) width = measuredW;
  else if (declW === "100%") width = fillsW && !abs ? { kind: "fill" } : measuredW;
  else if (fractionW !== undefined) width = { kind: "fraction", value: fractionW, capturedPx: round2(n.bounds.w) };
  else if (sharedFlexW) width = { kind: "fill" };
  else if (declW?.includes("%")) width = measuredW;
  else if (growthW) width = growthW;
  else if (ctx.parentAxis === "v" && (ctx.parentDisplay === "block" || ctx.parentAlign === "stretch") && !/inline/.test(s["display"] ?? "") && !abs) {
    width = fillsW ? { kind: "fill" } : hugsW ? { kind: "hug" } : measuredW;
  } else if (hugsW || !ctx.parent) width = { kind: "hug" };
  else if (fillsW && !abs) width = { kind: "fill" };
  else width = measuredW;

  // Complex percentage widths still use the captured border-box size. Only the simple
  // in-flow block subset below can be re-proposed against a native parent's live width.
  if (width.kind !== "fraction" && !sharedFlexW && declW?.includes("%") && declW !== "100%" && declW !== "0%") {
    notes.push(`approximated: width: ${declW} captured as ${round2(n.bounds.w)}px; generated view may not resize proportionally with its parent`);
  }

  let height: Size;
  if (declH && /px$/.test(declH)) height = measuredH;
  else if (declH === "100%") height = fillsH && !abs ? { kind: "fill" } : measuredH;
  else if (growthH) height = growthH;
  else if (ctx.parentAxis === "h" && ctx.parentAlign === "stretch" && !abs && fillsH) height = { kind: "fill" };
  else if (hugsH || !ctx.parent) height = { kind: "hug" };
  else height = measuredH;

  const constraints = constraintsOf(n, d, ctx, notes);

  // Horizontal margins on a block child are not part of the IR: the used `auto` margins of a
  // centred box, like plain side margins, make the margin box fill the parent while the border
  // box does not. Cap the width at what they leave and place the box the way they placed it.
  // (Computed style resolves `auto` to px, so this is geometry, not a declared property.)
  let selfAlign = horizontalAutoAlignment(n, width, ctx, notes);
  if (width.kind === "fill" && ctx.parentAxis === "v" && !abs) {
    const ml = px(s["margin-left"]);
    const mr = px(s["margin-right"]);
    if (ml + mr > 1) {
      constraints.maxWidth = Math.min(constraints.maxWidth ?? Number.POSITIVE_INFINITY, round2(n.bounds.w));
      if (Math.abs(ml - mr) <= 1) selfAlign = "center";
      else if (ml > mr) selfAlign = "end";
    }
  }
  return { width, height, ...constraints, ...(selfAlign !== undefined ? { selfAlign } : {}) };
}
