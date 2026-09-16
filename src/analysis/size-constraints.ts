/** Normalize browser-computed CSS constraints to the semantic border-box contract. */
import type { LayoutNode } from "../model/layout.ts";
import type { SizeConstraints } from "../model/semantic.ts";
import { resolveLength, round2 } from "../css/index.ts";
import { insetsOf } from "./geometry.ts";
import type { InferenceContext } from "./context.ts";

export function constraintsOf(n: LayoutNode, declared: Record<string, string>, ctx: InferenceContext, notes: string[]): SizeConstraints {
  const result: SizeConstraints = {};
  // CSS sizing constraints do not apply to ordinary non-replaced inline boxes.
  if (n.styles.display === "inline" && !["img", "svg", "input", "select", "textarea", "button", "video", "audio", "canvas", "iframe", "embed", "object"].includes(n.tag)) return result;
  const [pt, pr, pb, pl] = insetsOf(n.styles);
  const positioned = /^(absolute|fixed)$/.test(n.styles.position ?? "");
  const parentInsets = ctx.parent ? insetsOf(ctx.parent.styles) : undefined;
  const widthRef = ctx.parent && parentInsets && !positioned && ctx.parent.styles.display !== "inline"
    ? Math.max(0, ctx.parent.bounds.w - parentInsets[1] - parentInsets[3]) : undefined;

  for (const [property, key, vertical] of [
    ["min-width", "minWidth", false], ["max-width", "maxWidth", false],
    ["min-height", "minHeight", true], ["max-height", "maxHeight", true],
  ] as const) {
    const raw = n.styles[property] ?? declared[property];
    if (!raw || raw === "auto" || raw === "none" || (property.startsWith("min-") && /^(0|0px|0%)$/.test(raw))) continue;
    const insets = vertical ? pt + pb : pl + pr;
    const measured = vertical ? n.bounds.h : n.bounds.w;
    const relative = raw.includes("%");
    // A captured height does not establish whether its containing block had definite height.
    // Out-of-flow percentage widths may refer to an ancestor outside the measured subtree.
    const unresolved = relative && (vertical || widthRef === undefined);
    const resolved = unresolved ? undefined : resolveLength(raw, widthRef ?? 0);
    if (resolved === undefined) {
      result[key] = round2(Math.max(insets, measured));
      notes.push(`approximated: ${property} ${raw} → captured border-box ${round2(measured)}px; ${unresolved ? "containing-block sizing is not established" : "intrinsic/complex constraint is not reconstructed"}`);
    } else {
      result[key] = round2(Math.max(insets, resolved + (n.styles["box-sizing"] === "border-box" ? 0 : insets)));
    }
  }
  // CSS minimum sizing wins when a declared maximum is smaller than the minimum.
  if (result.minWidth !== undefined && result.maxWidth !== undefined) result.maxWidth = Math.max(result.minWidth, result.maxWidth);
  if (result.minHeight !== undefined && result.maxHeight !== undefined) result.maxHeight = Math.max(result.minHeight, result.maxHeight);
  return result;
}
