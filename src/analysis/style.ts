/** Computed visual styles and paint inference. */
import { type LayoutNode } from "../model/layout.ts";
import { type Style } from "../model/semantic.ts";
import { parseShadows } from "../css/index.ts";
import { backgroundFills } from "./style-background.ts";
import { borderStyle } from "./style-border.ts";
import { applyEffects } from "./style-effects.ts";
export { textPaintOf } from "./style-background.ts";

export function styleOf(n: LayoutNode, notes: string[]): Style {
  const s = n.styles;
  const { w, h } = n.bounds;
  const style: Style = { fills: backgroundFills(s, w, h, notes), shadows: parseShadows(s["box-shadow"]) };
  Object.assign(style, borderStyle(s, w, h, notes));
  applyEffects(n, style, notes);
  return style;
}
