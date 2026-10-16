/** CSS `@keyframes` animations captured by `browser/motion.ts` → IR `Motion` (D-MOTION), with per-node diagnostics. */
import type { Anim, LayoutNode, Transition } from "../model/layout.ts";
import {
  addDiagnostic,
  type Diagnostic,
  type KeyframeMotion,
  type Motion,
  type MotionChannel,
  type MotionTrack,
  type SemBase,
  type StateField,
  type StateStyle,
  type Style,
  type TransitionMap,
} from "../model/semantic.ts";
import { parseEasing } from "../css/easing.ts";
import { parseOrigin, transformChannels, type TransformChannels } from "../css/transforms.ts";

/** Channels each keyframed transform property drives. */
const CHANNELS: Record<string, MotionChannel[]> = {
  transform: ["tx", "ty", "sx", "sy", "deg"],
  translate: ["tx", "ty"],
  scale: ["sx", "sy"],
  rotate: ["deg"],
};
const MOVEMENT: MotionChannel[] = ["tx", "ty", "sx", "sy", "deg"];
/** Kind sequences CSS interpolates function by function and SwiftUI composes as offset · rotation · scale. */
const COMPOSABLE: Record<string, true> = {
  "": true,
  T: true,
  R: true,
  S: true,
  TR: true,
  TS: true,
  RS: true,
  TRS: true,
};
/** D-MOTION: a status indicator keeps its loop under Reduce Motion. */
const STATUS_ROLES: Record<string, true> = { status: true, progressbar: true };
/** Transitioned CSS longhand → the state paint field it draws; key order = which property's timing a field takes. */
const PAINT_FIELD: Record<string, StateField> = {
  "background-color": "fills",
  "background-image": "fills",
  "border-top-color": "border",
  "border-right-color": "border",
  "border-bottom-color": "border",
  "border-left-color": "border",
  "outline-color": "outline",
  "outline-style": "outline",
  "outline-width": "outline",
  "outline-offset": "outline",
  "box-shadow": "shadows",
  opacity: "opacity",
  transform: "transform",
  scale: "transform",
  translate: "transform",
  rotate: "transform",
  filter: "filters",
  color: "runColors",
  "-webkit-text-fill-color": "runColors",
  "text-decoration-color": "runColors",
};
const PAINT_ORDER = Object.keys(PAINT_FIELD);

/**
 * Captured pressed/focused transitions → per paint field timing, only for fields the node's look changes. `reduced`
 * is the author's reduce lists, else D-MOTION's fallback: movement (`transform`) jumps, fades keep their timing.
 */
export function transitionsOf(
  n: LayoutNode,
  states: SemBase["states"],
  diagnostics: Diagnostic[],
): Motion["transitions"] {
  const out: NonNullable<Motion["transitions"]> = {};
  for (const key of ["pressed", "focused"] as const) {
    const look = states?.[key];
    const captured = n.motion?.transitions?.[key];
    if (!look || !captured) continue;
    const map = (list: Transition[]) => mapTransitions(list, look, diagnostics);
    const into = map(captured.in);
    const back = map(captured.out);
    const reduced = captured.reduced
      ? { in: map(captured.reduced.in), out: map(captured.reduced.out) }
      : { in: { ...into }, out: { ...back } };
    if (!captured.reduced) {
      delete reduced.in.transform;
      delete reduced.out.transform;
    }
    // Kept when every field jumps: the emitted nil animation stops an ancestor's transition from reaching this look.
    out[key] = { in: into, out: back, reduced };
  }
  return Object.keys(out).length ? out : undefined;
}

/** One captured direction → field specs. ponytail: one spec per field (first property wins, reported); split fields if a design times border sides differently. */
function mapTransitions(list: Transition[], look: StateStyle, diagnostics: Diagnostic[]): TransitionMap {
  const out: TransitionMap = {};
  const from: Partial<Record<StateField, string>> = {};
  const ordered = list
    .filter((t) => Object.hasOwn(PAINT_FIELD, t.property) && t.duration > 0)
    .sort((a, b) => PAINT_ORDER.indexOf(a.property) - PAINT_ORDER.indexOf(b.property));
  for (const t of ordered) {
    let field = PAINT_FIELD[t.property]!;
    if (field === "border" && !look.border && look.borderSides) field = "borderSides";
    if (look[field] === undefined) continue;
    const easing = parseEasing(t.easing);
    if (!easing) {
      addDiagnostic(diagnostics, "approximated", "transition-timing-function", `${t.easing} on ${t.property} jumps`);
      continue;
    }
    if (t.delay < 0)
      addDiagnostic(
        diagnostics,
        "approximated",
        "transition-delay",
        `negative transition-delay ${t.delay}ms on ${t.property} starts from the beginning`,
      );
    const spec = { duration: t.duration, delay: Math.max(0, t.delay), easing };
    const first = out[field];
    if (!first) {
      out[field] = spec;
      from[field] = t.property;
    } else if (JSON.stringify(first) !== JSON.stringify(spec))
      addDiagnostic(
        diagnostics,
        "approximated",
        "transition-duration",
        `${t.property} transitions on the timing of ${from[field]}`,
      );
  }
  return out;
}

/** LayoutNode.motion → IR motion + per-node diagnostics. Undefined when nothing is mapped. Inference is mode-independent. */
export function motionOf(n: LayoutNode, style: Style, diagnostics: Diagnostic[]): Motion | undefined {
  const captured = n.motion;
  if (!captured?.animations && !captured?.reduced) return undefined;
  const t = style.transform;
  const base: Record<MotionChannel, number> = {
    opacity: style.opacity ?? 1,
    tx: t?.tx ?? 0,
    ty: t?.ty ?? 0,
    sx: t?.scaleX ?? 1,
    sy: t?.scaleY ?? 1,
    deg: t?.rotate ?? 0,
  };
  const animations = mapAnimations(captured.animations ?? [], n, base, diagnostics);
  let reduced: KeyframeMotion[];
  if (captured.reduced) reduced = mapAnimations(captured.reduced, n, base, diagnostics);
  else if (STATUS_ROLES[n.attrs["role"] ?? ""] || n.attrs["aria-busy"] === "true") reduced = animations;
  else
    reduced = animations
      .filter((a) => a.iterations !== "infinite")
      .map((a) => ({
        ...a,
        tracks: Object.fromEntries(Object.entries(a.tracks).filter(([c]) => !MOVEMENT.includes(c as MotionChannel))),
      }))
      .filter((a) => Object.keys(a.tracks).length);
  if (!animations.length && !reduced.length) return undefined;
  const driven = new Set([...animations, ...reduced].flatMap((a) => Object.keys(a.tracks) as MotionChannel[]));
  // `.offset` and `.scaleEffect` take both axes: a driven axis takes its partner's static value along.
  for (const [a, b] of [
    ["tx", "ty"],
    ["sx", "sy"],
  ] as const)
    if (driven.has(a) || driven.has(b)) driven.add(a).add(b);
  const motion: Motion = {
    ...(animations.length ? { animations } : {}),
    ...(JSON.stringify(reduced) !== JSON.stringify(animations) ? { reduced } : {}),
    base: Object.fromEntries([...driven].map((c) => [c, base[c]])),
  };
  const origin = parseOrigin(n.styles["transform-origin"]);
  const { w, h } = n.bounds;
  if (origin && w > 0 && h > 0 && (Math.abs(origin[0] / w - 0.5) > 1e-6 || Math.abs(origin[1] / h - 0.5) > 1e-6))
    motion.anchor = [origin[0] / w, origin[1] / h];
  return motion;
}

/** One captured list → IR animations with disjoint channels; dropped ones are reported. */
function mapAnimations(
  list: Anim[],
  n: LayoutNode,
  base: Record<MotionChannel, number>,
  diagnostics: Diagnostic[],
): KeyframeMotion[] {
  const out: KeyframeMotion[] = [];
  const driven = new Set<string>();
  for (const a of list) {
    if (a.timeline) {
      addDiagnostic(
        diagnostics,
        "unmapped",
        "animation-timeline",
        `scroll-driven animation ${a.name} is not translated (rendered settled)`,
      );
      continue;
    }
    // CSS shows the end state of a zero-length animation: the settled look already.
    if (a.duration <= 0) continue;
    if (a.composite) {
      addDiagnostic(
        diagnostics,
        "unmapped",
        "animation-composition",
        `animation ${a.name} composites with ${a.composite}; not translated (rendered settled)`,
      );
      continue;
    }
    const tracks = tracksOf(a, n, base, diagnostics);
    if (!tracks) continue;
    const clash = Object.keys(tracks).find((c) => driven.has(c));
    if (clash) {
      addDiagnostic(
        diagnostics,
        "unmapped",
        "animation-name",
        `two animations drive ${clash}; ${a.name} is not animated`,
      );
      continue;
    }
    for (const c of Object.keys(tracks)) driven.add(c);
    if (a.fill === "forwards" && a.delay > 0)
      addDiagnostic(
        diagnostics,
        "approximated",
        "animation-fill-mode",
        `animation ${a.name} shows its end look during the delay (fill-mode forwards)`,
      );
    out.push({
      name: a.name,
      duration: a.duration,
      delay: a.delay,
      iterations: a.iterations,
      direction: a.direction,
      fill: a.fill,
      tracks,
    });
  }
  return out;
}

/** Keyframes of one animation → channel tracks; undefined (reported) when no channel can be mapped. */
function tracksOf(
  a: Anim,
  n: LayoutNode,
  base: Record<MotionChannel, number>,
  diagnostics: Diagnostic[],
): Partial<Record<MotionChannel, MotionTrack>> | undefined {
  const tracks: Partial<Record<MotionChannel, MotionTrack>> = {};
  const skipped: string[] = [];
  const { w, h } = n.bounds;
  for (const prop of new Set(a.keyframes.flatMap((k) => Object.keys(k.values)))) {
    // CSS property-specific keyframes: only the ones that name this property.
    const frames = a.keyframes.filter((k) => Object.hasOwn(k.values, prop));
    let values: Array<Partial<Record<MotionChannel, number>>>;
    if (prop === "opacity") {
      values = frames.map((k) => {
        const v = k.values[prop]!.trim();
        return { opacity: v.endsWith("%") ? parseFloat(v) / 100 : Number(v) };
      });
      if (values.some((v) => !Number.isFinite(v.opacity))) {
        skipped.push(prop);
        continue;
      }
    } else if (CHANNELS[prop]) {
      const parsed = frames.map((k) => transformChannels(prop as "transform", k.values[prop]!, w, h)) as Array<
        TransformChannels | undefined
      >;
      const bad = parsed.findIndex((c) => !c || !COMPOSABLE[c.order]);
      if (bad >= 0) {
        addDiagnostic(
          diagnostics,
          "unmapped",
          "animation-name",
          `keyframed transform list ${frames[bad]!.values[prop]!.slice(0, 60)} is not translated (translate, scale and rotate only)`,
        );
        continue;
      }
      // `none` interpolates with any list; two lists function by function only when one's kinds are a prefix of the
      // other's (the shorter is padded with identity functions).
      const first = parsed.findIndex((c) => c!.order);
      const lead = parsed[first]?.order ?? "";
      const other = parsed.findIndex((c) => !lead.startsWith(c!.order) && !c!.order.startsWith(lead));
      if (other >= 0) {
        addDiagnostic(
          diagnostics,
          "unmapped",
          "animation-name",
          `transform list ${frames[first]!.values[prop]!.slice(0, 40)} / ${frames[other]!.values[prop]!.slice(0, 40)} does not interpolate per function`,
        );
        continue;
      }
      // CSS composes translate · rotate · scale · transform; the channels compose one transform.
      const individual = ["translate", "rotate", "scale"].filter((p) => (n.styles[p] ?? "none") !== "none");
      if (prop === "transform" ? individual.length > 0 : staticBeyond(base, prop))
        addDiagnostic(
          diagnostics,
          "approximated",
          "animation-name",
          prop === "transform"
            ? `animated transform composed after the static ${individual.join("/")}`
            : `animated ${prop} composed after the static transform`,
        );
      values = parsed.map((c) =>
        Object.fromEntries(CHANNELS[prop]!.map((ch) => [ch, c![ch as keyof TransformChannels] as number])),
      );
    } else {
      skipped.push(prop);
      continue;
    }
    for (const channel of Object.keys(values[0]!) as MotionChannel[]) {
      const series = values.map((v) => v[channel]!);
      // A constant track at the settled value draws nothing the static look does not.
      if (series.every((v) => v === base[channel])) continue;
      if (tracks[channel]) {
        addDiagnostic(
          diagnostics,
          "unmapped",
          "animation-name",
          `two animations drive ${channel}; ${prop} is not animated`,
        );
        continue;
      }
      const segments: MotionTrack["segments"] = [];
      for (let i = 1; i < frames.length; i++) {
        const easing = parseEasing(frames[i - 1]!.easing);
        if (!easing) {
          addDiagnostic(
            diagnostics,
            "unmapped",
            "animation-timing-function",
            `easing ${frames[i - 1]!.easing.slice(0, 40)} of animation ${a.name} is not translated`,
          );
          return undefined;
        }
        segments.push({ to: series[i]!, until: frames[i]!.offset, easing });
      }
      tracks[channel] = { from: series[0]!, segments };
    }
  }
  const mapped = Object.keys(tracks).length > 0;
  for (const prop of skipped)
    addDiagnostic(
      diagnostics,
      mapped ? "approximated" : "unmapped",
      "animation-name",
      `keyframed ${prop} is not animated`,
    );
  return mapped ? tracks : undefined;
}

/** Whether the static transform has a component the individual property `prop` does not drive. */
function staticBeyond(base: Record<MotionChannel, number>, prop: string): boolean {
  const own = CHANNELS[prop]!;
  const identity: Record<MotionChannel, number> = { opacity: 1, tx: 0, ty: 0, sx: 1, sy: 1, deg: 0 };
  return MOVEMENT.some((c) => !own.includes(c) && base[c] !== identity[c]);
}
