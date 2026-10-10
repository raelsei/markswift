import type { Color, Paint, Shadow } from "../../model/values.ts";
import type { Screen, SemNode, Style, SvgGradient, TextRun } from "../../model/semantic.ts";
import { walk } from "../../model/semantic.ts";
import type { Slot, TokenRole, Usage } from "./types.ts";

// ---------- colour slot enumeration ----------

/** Fully transparent colours are `.clear`; they carry no value worth naming. */
function visible(c: Color | undefined): c is Color {
  return c !== undefined && c.a > 0;
}

function pushPaint(out: Slot[], p: Paint, key: string, role: TokenRole): void {
  if (p.kind === "solid") {
    if (visible(p.color)) out.push({ key, role, color: p.color });
    return;
  }
  if (p.kind === "linear" || p.kind === "radial" || p.kind === "conic") {
    p.stops.forEach((s, j) => {
      if (!visible(s.color)) return;
      const stop = j === 0 ? "from" : j === p.stops.length - 1 ? "to" : p.stops.length === 3 ? "via" : undefined;
      out.push({ key: `${key}.s${j}`, role, color: s.color, ...(stop ? { stop } : {}) });
    });
  }
}

function pushShadow(out: Slot[], s: Shadow, key: string): void {
  if (visible(s.color)) out.push({ key, role: "shadow", color: s.color });
}

function pushGradient(out: Slot[], g: SvgGradient, key: string): void {
  g.stops.forEach((s, j) => {
    if (visible(s.color)) out.push({ key: `${key}.s${j}`, role: "icon", color: s.color });
  });
}

function pushStyle(out: Slot[], st: Style): void {
  st.fills.forEach((p, i) => { pushPaint(out, p, `fill${i}`, "fill"); });
  if (st.border && st.border.width > 0) {
    if (visible(st.border.color)) out.push({ key: "border", role: "border", color: st.border.color });
  }
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const e = st.borderSides?.[edge];
    if (e && e.width > 0 && visible(e.color)) out.push({ key: `border.${edge}`, role: "border", color: e.color });
  }
  if (st.outline && st.outline.width > 0 && visible(st.outline.color)) out.push({ key: "outline", role: "border", color: st.outline.color });
  st.shadows.forEach((s, i) => { pushShadow(out, s, `shadow${i}`); });
  st.filters?.forEach((f, i) => {
    if (f.kind === "drop-shadow") pushShadow(out, f.shadow, `filter${i}`);
  });
}

function pushRun(out: Slot[], r: TextRun, i: number): void {
  if (r.paint) pushPaint(out, r.paint, `run${i}.paint`, "text");
  else if (visible(r.color)) out.push({ key: `run${i}`, role: "text", color: r.color });
  if (r.decoration && visible(r.decoration.color)) out.push({ key: `run${i}.dec`, role: "text", color: r.decoration.color });
  if (r.shadow) pushShadow(out, r.shadow, `run${i}.shadow`);
}

/**
 * Every colour one node paints, in a deterministic order. Keys are stable across themes so
 * the same slot of the same node can be paired: that pairing is what makes a token semantic.
 */
function colorSlots(n: SemNode): Slot[] {
  const out: Slot[] = [];
  pushStyle(out, n.style);
  if (n.kind === "text") n.runs.forEach((r, i) => { pushRun(out, r, i); });
  if (n.kind === "svg") {
    n.paths.forEach((p, i) => {
      if (p.gradient) pushGradient(out, p.gradient, `path${i}.fill`);
      else if (visible(p.fill)) out.push({ key: `path${i}.fill`, role: "icon", color: p.fill });
      if (p.strokeGradient) pushGradient(out, p.strokeGradient, `path${i}.stroke`);
      else if (visible(p.stroke)) out.push({ key: `path${i}.stroke`, role: "icon", color: p.stroke });
    });
    n.texts?.forEach((t, i) => {
      if (visible(t.fill)) out.push({ key: `text${i}`, role: "icon", color: t.fill });
    });
  }
  // Text the emitter paints outside a `TextNode`: a control's own label/value colour and the
  // alt text of a broken image. Both land in the view as a `.foregroundStyle`, so both are
  // literals a token can replace.
  if (n.kind === "control" && visible(n.color)) out.push({ key: "control", role: "text", color: n.color });
  if (n.kind === "image" && visible(n.color)) out.push({ key: "alt", role: "text", color: n.color });
  return out;
}

// ---------- pairing ----------

/** `home-light` + theme `light` → `home`; a name without the suffix is its own base. */
export function screenBase(screen: Screen): string {
  const suffix = `-${screen.theme}`;
  return screen.name.endsWith(suffix) ? screen.name.slice(0, -suffix.length) : screen.name;
}

/** Nodes of one screen in document order, with their slots and token hints. */
function screenSlots(s: Screen): Array<{ id: string; hints: string[]; slots: Slot[] }> {
  const out: Array<{ id: string; hints: string[]; slots: Slot[] }> = [];
  const canvasSlot: Slot[] = visible(s.canvas) ? [{ key: "canvas", role: "canvas", color: s.canvas }] : [];
  out.push({ id: "#screen", hints: [], slots: canvasSlot });
  walk(s.root, (n) => out.push({ id: n.id, hints: n.style.tokens ?? [], slots: colorSlots(n) }));
  return out;
}

/**
 * Pair the themes slot by slot. Screens are grouped by {@link screenBase}; inside a group the
 * light screen drives document order and the dark screen supplies the second value. Only the
 * light screen is emitted, so a slot the dark screen alone paints makes no usage at all; a light
 * slot without a dark counterpart stays unpaired — it can still make a static token, never a
 * semantic one. {@link themeDrift} reports both.
 */
export function pairUsages(screens: Screen[]): Usage[] {
  const groups = new Map<string, Screen[]>();
  for (const s of screens) {
    const base = screenBase(s);
    const g = groups.get(base);
    if (g) g.push(s);
    else groups.set(base, [s]);
  }
  const usages: Usage[] = [];
  let order = 0;
  for (const [base, group] of groups) {
    const light = group.find((s) => s.theme === "light");
    const dark = group.find((s) => s.theme === "dark");
    const primary = light ?? dark!;
    const secondary = primary === light ? dark : undefined;
    const other = new Map<string, Map<string, Color>>();
    if (secondary) for (const n of screenSlots(secondary)) other.set(n.id, new Map(n.slots.map((s) => [s.key, s.color])));
    for (const n of screenSlots(primary)) {
      const counterpart = other.get(n.id);
      for (const s of n.slots) {
        usages.push({ base, theme: primary.theme, nodeId: n.id, slot: s.key, role: s.role, light: s.color, dark: counterpart?.get(s.key), hints: n.hints, order: order++, ...(s.stop ? { stop: s.stop } : {}) });
      }
    }
  }
  return usages;
}

/**
 * Node ids where the dark screen differs from the light one in more than colour: a node or a
 * colour slot present in one theme only, or a frame that moved or resized by more than 0.5px.
 * An adaptive view is the light layout with paired colours, so these keep their light values.
 */
export function themeDrift(light: Screen, dark: Screen): string[] {
  type Entry = { frame: { x: number; y: number; w: number; h: number }; slots: string };
  const entries = (s: Screen) => {
    const out = new Map<string, Entry>();
    for (const n of screenSlots(s)) out.set(n.id, { frame: { x: 0, y: 0, ...s.size }, slots: n.slots.map((x) => x.key).join() });
    walk(s.root, (n) => { out.get(n.id)!.frame = n.frame; });
    return out;
  };
  const l = entries(light), d = entries(dark);
  const drift = new Set<string>();
  for (const [id, a] of l) {
    const b = d.get(id);
    if (!b || a.slots !== b.slots || (["x", "y", "w", "h"] as const).some((k) => Math.abs(a.frame[k] - b.frame[k]) > 0.5)) drift.add(id);
  }
  for (const id of d.keys()) if (!l.has(id)) drift.add(id);
  return [...drift];
}
