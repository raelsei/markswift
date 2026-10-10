/** CSS flex alignment and distribution mapped to semantic axes, in visual terms (start = left/top). */
import type { LayoutNode } from "../model/layout.ts";
import type { CrossAlign, Distribution } from "../model/semantic.ts";
import { isFlex, mainAxis } from "./geometry.ts";

/**
 * Cross-axis keyword → visual side. A column's cross axis is the inline axis, so in RTL its
 * flex-start/start sit on the right. Shared by `align-items` and `align-self`.
 */
function crossValue(v: string, container: LayoutNode): CrossAlign | undefined {
  const mirrored = mainAxis(container) === "v" && container.styles["direction"] === "rtl";
  switch (v) {
    case "center":
      return "center";
    case "flex-start":
    case "start":
    case "self-start":
      return mirrored ? "end" : "start";
    case "flex-end":
    case "end":
    case "self-end":
      return mirrored ? "start" : "end";
    case "baseline":
    case "first baseline":
      return "baseline";
    case "normal":
    case "stretch":
      return "stretch";
    default:
      return undefined;
  }
}

export function crossAlign(n: LayoutNode): CrossAlign {
  if (!isFlex(n.styles["display"])) return "stretch";
  return crossValue(n.styles["align-items"] ?? "normal", n) ?? "stretch";
}

/** A flex item's own `align-self`, resolved like `align-items`; undefined for `auto` (follow the container). */
export function alignSelfOf(child: LayoutNode, container: LayoutNode): CrossAlign | undefined {
  if (!isFlex(container.styles["display"])) return undefined;
  const v = child.styles["align-self"];
  return v && v !== "auto" ? crossValue(v, container) : undefined;
}

/**
 * Main-axis packing in *visual* terms (children are ordered by measured position: start =
 * left/top). flex-start/flex-end follow the flex direction, start/end the writing direction,
 * left/right are physical (start in a column) — all verified against Chrome.
 */
export function distributionOf(n: LayoutNode): Distribution {
  if (!isFlex(n.styles["display"])) return "start";
  const dir = n.styles["flex-direction"] ?? "row";
  const row = dir.startsWith("row");
  const rtl = n.styles["direction"] === "rtl";
  const flexReversed = row ? (dir === "row-reverse") !== rtl : dir === "column-reverse";
  const inlineReversed = row && rtl;
  switch (n.styles["justify-content"] ?? "normal") {
    case "center":
      return "center";
    case "space-between":
      return "between";
    case "space-around":
      return "around";
    case "space-evenly":
      return "evenly";
    case "flex-end":
      return flexReversed ? "start" : "end";
    case "end":
      return inlineReversed ? "start" : "end";
    case "start":
      return inlineReversed ? "end" : "start";
    case "right":
      return row ? "end" : "start";
    case "left":
      return "start";
    default:
      return flexReversed ? "end" : "start"; // normal, flex-start, stretch
  }
}
