/** Browser-width rules safe to keep responsive in a SwiftUI view. */
import type { LayoutNode } from "../model/layout.ts";
import { px } from "../css/index.ts";
import { insetsOf } from "./geometry.ts";
import type { InferenceContext } from "./context.ts";

/** Equal calc-based flex tracks that exactly pack a row can use native equal-width allocation. */
export function equalCalculatedFlexWidth(n: LayoutNode, declared: string, ctx: InferenceContext): boolean {
  const match = /^calc\(\s*(\d+(?:\.\d+)?)%\s*([+-])\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(declared.trim());
  const parent = ctx.parent;
  if (!match || !parent || ctx.parentAxis !== "h" || !/flex/.test(ctx.parentDisplay ?? "")) return false;
  if (!/^row$/.test(parent.styles["flex-direction"] ?? "row") ||
    !/^(?:nowrap|none)$/.test(parent.styles["flex-wrap"] ?? "nowrap")) return false;
  if (parent.children.some((child) => child.tag === "#text" && child.text?.trim())) return false;
  const siblings = parent.children.filter((child) => child.tag !== "#text" && child.styles.display !== "none");
  if (siblings.length < 2 || !siblings.includes(n)) return false;
  if (siblings.some((child) => child.preferredSize?.width !== declared ||
    (child.styles.position && child.styles.position !== "static") ||
    (child.styles.float && child.styles.float !== "none") ||
    !/^(?:auto|0(?:px)?)$/.test(child.styles["min-width"] ?? "auto") ||
    (child.styles["max-width"] ?? "none") !== "none" ||
    (child.styles["flex-basis"] ?? "auto") !== "auto" ||
    insetsOf(child.styles).some((inset) => inset !== 0) ||
    ["flex-grow", "flex-shrink", "flex-basis"].some((property) => child.styles[property] !== n.styles[property]) ||
    ["left", "right"].some((edge) => px(child.styles[`margin-${edge}`]) !== 0))) return false;
  const [, right, , left] = insetsOf(parent.styles);
  const available = parent.bounds.w - left - right;
  const fraction = Number(match[1]) / 100;
  const offset = Number(match[3]) * (match[2] === "-" ? -1 : 1);
  const gap = px(parent.styles["column-gap"] ?? parent.styles.gap);
  // The equal-share identity must hold at every parent width, not merely at capture width.
  if (Math.abs(siblings.length * fraction - 1) > 0.000001 ||
    Math.abs(siblings.length * offset + gap * (siblings.length - 1)) > 0.000001) return false;
  if (!(available > 0) || siblings.some((child) => Math.abs(child.bounds.w - (available * fraction + offset)) > 1)) return false;
  return Math.abs(siblings.reduce((sum, child) => sum + child.bounds.w, 0) + gap * (siblings.length - 1) - available) <= 1;
}

/** Admit only the width rule that a plain vertical SwiftUI stack can reproduce. */
export function responsiveFraction(n: LayoutNode, declared: string, ctx: InferenceContext): number | undefined {
  const match = /^(?:([0-9]+(?:\.[0-9]+)?)|(\.[0-9]+))%$/.exec(declared.trim());
  if (!match || !ctx.parent || ctx.parentDisplay !== "block" || ctx.parentAxis !== "v") return;
  const fraction = Number(match[1] ?? match[2]) / 100;
  if (!(fraction > 0 && fraction < 1)) return;
  const parent = ctx.parent;
  if (n.styles.display !== "block" || parent.styles.display !== "block") return;
  // CSS block-start in RTL is the right edge. The emitted column currently aligns a partial
  // width child differently, so retaining a responsive width would hide a placement loss.
  if ([n, parent].some((box) => box.styles.direction === "rtl" ||
    (box.styles["writing-mode"] !== undefined && box.styles["writing-mode"] !== "horizontal-tb"))) return;
  // Gradients, masks and geometric effects are currently resolved against the captured box
  // in pixels. A resizing box (or any of its descendants) would keep stale paint geometry.
  if (hasCapturedPaintGeometry(n)) return;
  if (![n, parent].every((box) => {
    const s = box.styles;
    return (!s.position || s.position === "static") && (!s.float || s.float === "none")
      && (!s.transform || s.transform === "none")
      && (!s["min-width"] || /^(?:auto|0(?:px)?)$/.test(s["min-width"]))
      && (!s["max-width"] || s["max-width"] === "none")
      && insetsOf(s).every((inset) => inset === 0)
      && ["left", "right", "top", "bottom"].every((edge) => px(s[`margin-${edge}`]) === 0);
  })) return;
  // Inline/float siblings turn the inferred parent into rows or measured fallback layouts.
  if (parent.children.some((child) => child.tag === "#text" ? Boolean(child.text?.trim())
    : child.styles.display !== "block" || (child.styles.float && child.styles.float !== "none")
      || (child.styles.position && child.styles.position !== "static"))) return;
  if (Math.abs(n.bounds.w - parent.bounds.w * fraction) > 1) return;
  return fraction;
}

function hasCapturedPaintGeometry(n: LayoutNode): boolean {
  const s = n.styles;
  if (["svg", "img", "canvas", "video", "iframe", "object", "embed"].includes(n.tag)) return true;
  if (["background-image", "mask-image", "clip-path", "box-shadow", "filter", "backdrop-filter"]
    .some((property) => s[property] !== undefined && s[property] !== "none")) return true;
  if (["top-left", "top-right", "bottom-right", "bottom-left"]
    .some((corner) => !zeroRadius(s[`border-${corner}-radius`]))) return true;
  return n.children.some(hasCapturedPaintGeometry);
}

function zeroRadius(value: string | undefined): boolean {
  return value === undefined || value.trim().split(/\s+/).every((part) => /^0(?:\.0+)?(?:px|%)?$/.test(part));
}
