/** Computed visual styles and paint inference. */
import { type LayoutNode } from "../model/layout.ts";
import { type Style, type Diagnostic, type SemBase, type StateStyle, addDiagnostic } from "../model/semantic.ts";
import { parseShadows } from "../css/index.ts";
import { backgroundFills } from "./style-background.ts";
import { borderStyle } from "./style-border.ts";
import { applyEffects } from "./style-effects.ts";

export function styleOf(n: LayoutNode, diagnostics: Diagnostic[]): Style {
  const s = n.styles;
  const { w, h } = n.bounds;
  const dropped: string[] = [];
  const style: Style = {
    fills: backgroundFills(s, w, h, diagnostics),
    shadows: parseShadows(s["box-shadow"], dropped),
  };
  for (const x of dropped)
    addDiagnostic(diagnostics, "unmapped", "box-shadow", `shadow ${x} could not be parsed; dropped`);
  Object.assign(style, borderStyle(s, w, h, diagnostics));
  applyEffects(n, style, diagnostics);
  return style;
}

const STATE_FIELDS = [
  "fills",
  "border",
  "borderSides",
  "outline",
  "shadows",
  "opacity",
  "transform",
  "filters",
] as const;
const IDENTITY = { rotate: 0, scaleX: 1, scaleY: 1, tx: 0, ty: 0 };

/** `n.states` → paint deltas against the resting `rest`, by running `styleOf` on the state's computed values. */
export function stateStylesOf(n: LayoutNode, rest: Style): SemBase["states"] {
  if (!n.states) return undefined;
  const out: NonNullable<SemBase["states"]> = {};
  for (const key of ["pressed", "focused"] as const) {
    const delta = n.states[key];
    if (!delta) continue;
    // Diagnostics of the state pass would duplicate the resting ones.
    const st = styleOf({ ...n, styles: { ...n.styles, ...delta } }, []);
    const diff: StateStyle = {};
    for (const f of STATE_FIELDS) {
      if (JSON.stringify(st[f] ?? null) === JSON.stringify(rest[f] ?? null)) continue;
      // A field the state removes is kept in its invisible form, so the emitter can pair it with rest.
      (diff as Record<string, unknown>)[f] =
        st[f] ??
        (f === "opacity"
          ? 1
          : f === "transform"
            ? IDENTITY
            : f === "fills" || f === "shadows" || f === "filters"
              ? []
              : transparent(rest[f]));
    }
    if (Object.keys(diff).length) out[key] = diff;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Deep copy of a border/outline/borderSides value with every colour's alpha at 0. */
function transparent<T>(v: T): T {
  return JSON.parse(JSON.stringify(v), (k, x) => (k === "a" && typeof x === "number" ? 0 : x)) as T;
}
