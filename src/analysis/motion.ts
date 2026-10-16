/** CSS `@keyframes` animations captured by `browser/motion.ts` → IR `Motion` (D-MOTION), with per-node diagnostics. */
import type { Anim, LayoutNode } from "../model/layout.ts";
import {
  addDiagnostic,
  type Diagnostic,
  type KeyframeMotion,
  type Motion,
  type MotionChannel,
  type MotionTrack,
  type Style,
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
    // CSS shows the end state of a zero-length animation: the settled look already.
    if (a.duration <= 0) continue;
    if (a.timeline) {
      addDiagnostic(
        diagnostics,
        "unmapped",
        "animation-timeline",
        `scroll-driven animation ${a.name} is not translated (rendered settled)`,
      );
      continue;
    }
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
