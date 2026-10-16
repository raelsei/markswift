/**
 * Pressed/focused/open looks → what the emitter draws: the union of the resting and the state paint,
 * with every colour that differs paired so `colorExpr` writes `(cond ? state : rest)`.
 */
import type { Color } from "../model/values.ts";
import type { Edge, SemNode, StateStyle, Style } from "../model/semantic.ts";
import type { StatePaint } from "./context.ts";
import { colorArgs } from "./format.ts";
import { note } from "./diagnostics.ts";

const IDENTITY = { rotate: 0, scaleX: 1, scaleY: 1, tx: 0, ty: 0 };
/** The feature a look's losses are reported under. */
const FEATURE: Record<"pressed" | "focused" | "open", string> = {
  pressed: ":active",
  focused: ":focus-visible",
  open: "@aria-*",
};
const clear = (c: Color): Color => ({ ...c, a: 0 });

export function pairStyle(
  n: SemNode,
  state: StateStyle,
  cond: string,
  kind: "pressed" | "focused" | "open",
): StatePaint {
  // ponytail: keyed by colour value, so two slots of one node painting the same rest colour flip together; key by slot when a design needs them apart.
  const colors: StatePaint["colors"] = new Map();
  const style: Style = { ...n.style };
  const out: StatePaint = { cond, style, colors };
  const unsupported = (what: string) =>
    note(n, "approximated", FEATURE[kind], `${what} in the ${kind} look is not reproduced`);
  // The style carries whichever colour of the pair is visible at rest (else the state's), so the
  // emitter draws the layer at all; the map answers for that colour.
  const pair = (rest: Color, to: Color): Color => {
    if (JSON.stringify(rest) === JSON.stringify(to)) return rest;
    const shown = rest.a > 0 ? rest : to;
    colors.set(colorArgs(shown), { rest, state: to });
    return shown;
  };
  // A stroke (border, edge, outline) whose geometry holds: rest absent → the state's, from transparent.
  const stroke = <T extends { width: number; color: Color }>(rest: T | undefined, to: T | undefined, what: string) => {
    if (!to) return rest;
    if (!rest) return { ...to, color: pair(clear(to.color), to.color) };
    const { color: _a, ...restShape } = rest;
    const { color: _b, ...toShape } = to;
    if (JSON.stringify(restShape) !== JSON.stringify(toShape)) {
      unsupported(`${what} width or style change`);
      return rest;
    }
    return { ...rest, color: pair(rest.color, to.color) };
  };

  if (state.fills) {
    const rest = n.style.fills;
    const to = state.fills;
    if (rest.length === to.length && rest.every((f, i) => f.kind === "solid" && to[i]!.kind === "solid"))
      style.fills = rest.map((f, i) =>
        f.kind === "solid" && to[i]!.kind === "solid" ? { ...f, color: pair(f.color, to[i]!.color) } : f,
      );
    else if (!rest.length && to.every((f) => f.kind === "solid"))
      style.fills = to.map((f) => (f.kind === "solid" ? { ...f, color: pair(clear(f.color), f.color) } : f));
    else unsupported("background-image change");
  }
  if (state.border) style.border = stroke(n.style.border, state.border, "border");
  if (state.borderSides) {
    const sides: NonNullable<Style["borderSides"]> = { ...n.style.borderSides };
    for (const e of ["top", "right", "bottom", "left"] as const) {
      const v = stroke<Edge>(n.style.borderSides?.[e], state.borderSides[e], "border");
      if (v) sides[e] = v;
    }
    style.borderSides = sides;
  }
  if (state.outline) style.outline = stroke(n.style.outline, state.outline, "outline");
  if (state.shadows) {
    const to = state.shadows;
    const geometry = (s: (typeof to)[number]) => JSON.stringify([s.x, s.y, s.blur, s.spread, s.inset]);
    const matched = new Set<number>();
    style.shadows = n.style.shadows.map((s) => {
      const i = to.findIndex((t, k) => !matched.has(k) && geometry(t) === geometry(s));
      if (i >= 0) matched.add(i);
      return { ...s, color: pair(s.color, i >= 0 ? to[i]!.color : clear(s.color)) };
    });
    // Shadows only the state draws go behind the resting ones (CSS lists front-most first).
    to.forEach((t, k) => {
      if (!matched.has(k)) style.shadows.push({ ...t, color: pair(clear(t.color), t.color) });
    });
  }
  if (state.opacity !== undefined) out.opacity = { rest: n.style.opacity ?? 1, state: state.opacity };
  if (state.transform) {
    const rest = n.style.transform ?? { ...IDENTITY, origin: state.transform.origin };
    const to = state.transform;
    const same = (["rotate", "tx", "ty", "skewX", "skewY"] as const).every((k) => (rest[k] ?? 0) === (to[k] ?? 0));
    if (same) {
      out.scale = { rest: [rest.scaleX, rest.scaleY], state: [to.scaleX, to.scaleY] };
      style.transform = rest;
    } else unsupported("transform change other than scale");
  }
  if (state.filters) unsupported("filter change");
  if (n.kind === "text")
    state.runColors?.forEach((c, i) => {
      const run = n.runs[i];
      if (c && run) colors.set(`run${i}`, { rest: run.color, state: c });
    });
  return out;
}
