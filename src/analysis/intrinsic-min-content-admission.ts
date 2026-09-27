import type { LayoutNode } from "../model/layout.ts";
import type { SemNode } from "../model/semantic.ts";
import { intrinsicFontSettingsReason } from "./intrinsic-font-settings.ts";

export const fixedPx = (value: string | undefined): boolean => value !== undefined && /^(?:0|\d+(?:\.\d+)?px)$/.test(value);
const zero = (value: string | undefined) => value === "0" || value === "0px";
const unconstrained = (value: string | undefined, minimum = false) => value === "auto" || value === "none" || (minimum && zero(value));

/** Indentation alters the first-line intrinsic contribution; ordinary word advances omit it. */
function textIndentReason(source: LayoutNode): string | undefined {
  if (source.styles.display === "none") return;
  if (source.tag !== "#text") {
    const value = source.styles["text-indent"];
    if (value === undefined) return "text-indent metadata unavailable";
    if (!zero(value)) return `unsupported text-indent:${value}`;
  }
  for (const child of source.children) {
    const reason = textIndentReason(child);
    if (reason) return reason;
  }
}

/** Common ordinary-box boundary. Atomic controls have a separate fixed-box proof. */
export function ordinaryIntrinsicReason(source: LayoutNode, sem: SemNode, root = false): string | undefined {
  const s = source.styles, preferred = source.preferredSize;
  if (!/^(block|flow-root)$/.test(s.display ?? "")) return "not ordinary block/flow-root content";
  if (preferred?.width !== "auto" || preferred.hasRelativePadding) return "relative or unknown preferred width/padding";
  if (!preferred.horizontalAutoMargins || preferred.horizontalAutoMargins.some(Boolean)
    || !zero(s["margin-left"]) || !zero(s["margin-right"])) return "non-atomic horizontal margin or margin intent unavailable";
  if (root && s["max-width"] !== "none" && !fixedPx(s["max-width"])) return "relative or unsupported root maximum";
  if (root && sem.width.kind !== "fill") return "requires semantic fill; source auto-stretch behind captured hug is unproved";
  if (s.direction !== "ltr" || s["writing-mode"] !== "horizontal-tb") return "non-horizontal LTR content";
  if (!unconstrained(s["aspect-ratio"]) && s["aspect-ratio"] !== undefined) return "aspect-ratio contribution is unproved";
  if (source.tag.startsWith("::") || source.flattenedCustomElements?.length) return "generated or flattened source topology";
  if ((s.position ?? "static") !== "static" || (s.float ?? "none") !== "none") return "out-of-flow, relative or floated contribution";
  if (sem.overlays.length || sem.style.clip || sem.style.transform || sem.style.hidden
    || ["transform", "contain", "content-visibility"].some(key => s[key] && !/^(none|visible)$/.test(s[key]!))) return "complex/contained content";
  if (["overflow-x", "overflow-y"].some(key => s[key] && s[key] !== "visible")) return "clipped or scrolling contribution";
  if (!["left", "right"].every(edge => fixedPx(s[`padding-${edge}`]) && fixedPx(s[`border-${edge}-width`]))) return "physical content insets unavailable";
  if (!root && (!unconstrained(s["min-width"], true) || !unconstrained(s["max-width"]))) return "constrained descendant contribution is unproved";
  if (!root && sem.intrinsicMinWidth) return "constrained descendant contribution is unproved";
  if (root && s["max-width"] === "none" && sem.maxWidth !== undefined) return "synthesized captured width cap";
  return textIndentReason(source) ?? intrinsicFontSettingsReason(source);
}
