/** CSS flex alignment and distribution mapped to semantic axes. */
import type { LayoutNode } from "../model/layout.ts";
import type { CrossAlign, Distribution } from "../model/semantic.ts";
import { isFlex } from "./geometry.ts";

export function crossAlign(n: LayoutNode): CrossAlign {
  if (!isFlex(n.styles["display"])) return "stretch";
  const ai = n.styles["align-items"] ?? "normal";
  if (ai === "center") return "center";
  if (ai === "flex-end" || ai === "end") return "end";
  if (ai === "flex-start" || ai === "start") return "start";
  if (ai === "baseline") return "baseline";
  return "stretch";
}

export function distributionOf(jc: string | undefined, display: string): Distribution {
  if (!isFlex(display)) return "start";
  switch (jc) {
    case "center":
      return "center";
    case "flex-end":
    case "end":
      return "end";
    case "space-between":
      return "between";
    case "space-around":
      return "around";
    case "space-evenly":
      return "evenly";
    default:
      return "start";
  }
}
