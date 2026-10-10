/** Computed visual styles and paint inference. */
import { type LayoutNode } from "../model/layout.ts";
import { type Style, type Diagnostic, addDiagnostic } from "../model/semantic.ts";
import { parseShadows } from "../css/index.ts";
import { backgroundFills } from "./style-background.ts";
import { borderStyle } from "./style-border.ts";
import { applyEffects } from "./style-effects.ts";

export function styleOf(n: LayoutNode, diagnostics: Diagnostic[]): Style {
  const s = n.styles;
  const { w, h } = n.bounds;
  const dropped: string[] = [];
  const style: Style = { fills: backgroundFills(s, w, h, diagnostics), shadows: parseShadows(s["box-shadow"], dropped) };
  for (const x of dropped) addDiagnostic(diagnostics, "unmapped", "box-shadow", `shadow ${x} could not be parsed; dropped`);
  Object.assign(style, borderStyle(s, w, h, diagnostics));
  applyEffects(n, style, diagnostics);
  return style;
}
