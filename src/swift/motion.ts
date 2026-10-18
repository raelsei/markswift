/** IR `Motion` → the `MarkswiftAnimation` modifier (runtime/motion.swift). App output only. */
import type {
  Easing,
  KeyframeMotion,
  Motion,
  MotionChannel,
  SemNode,
  StateField,
  StateTransition,
  TransitionSpec,
} from "../model/semantic.ts";
import type { EmitMode } from "./context.ts";
import { num } from "./format.ts";

/** App output plays the node's animations; `motion.base` names the channels the modifier drives. */
export const animated = (n: SemNode, mode: EmitMode): boolean =>
  mode === "app" && !!(n.motion?.animations?.length || n.motion?.reduced);

/** IR channel → `MarkswiftMotion` / `MarkswiftMotionValue` member. */
const MEMBER: Record<MotionChannel, string> = {
  opacity: "opacity",
  tx: "x",
  ty: "y",
  sx: "scaleX",
  sy: "scaleY",
  deg: "degrees",
};
const IDENTITY: Record<MotionChannel, number> = { opacity: 1, tx: 0, ty: 0, sx: 1, sy: 1, deg: 0 };
const DIRECTION: Record<KeyframeMotion["direction"], string> = {
  normal: "",
  reverse: ".reverse",
  alternate: ".alternate",
  "alternate-reverse": ".alternateReverse",
};
const CHANNELS = Object.keys(MEMBER) as MotionChannel[];

export function easeExpr(e: Easing): string {
  if ("bezier" in e) return `.bezier(${e.bezier.map(num).join(", ")})`;
  if ("steps" in e) return `.steps(${e.steps[0]}, .${e.steps[1]})`;
  return `.points([${e.points[0].map(num).join(", ")}], [${e.points[1].map(num).join(", ")}])`;
}

/** `MarkswiftTiming(…)` in seconds; defaults omitted. */
export function timingExpr(k: KeyframeMotion): string {
  const args = [`duration: ${num(k.duration / 1000)}`];
  if (k.delay) args.push(`delay: ${num(k.delay / 1000)}`);
  if (k.iterations !== 1) args.push(`iterations: ${k.iterations === "infinite" ? ".infinity" : num(k.iterations)}`);
  if (DIRECTION[k.direction]) args.push(`direction: ${DIRECTION[k.direction]}`);
  if (k.fill === "backwards" || k.fill === "both") args.push("fillBackwards: true");
  if (k.fill === "forwards" || k.fill === "both") args.push("fillForwards: true");
  return `MarkswiftTiming(${args.join(", ")})`;
}

function motionList(list: KeyframeMotion[]): string {
  const items = list.map((k) => {
    const tracks = CHANNELS.filter((c) => k.tracks[c]).map((c) => {
      const t = k.tracks[c]!;
      const segments = t.segments.map((s) => `MarkswiftSegment(${num(s.to)}, ${num(s.until)}, ${easeExpr(s.easing)})`);
      return `${MEMBER[c]}: MarkswiftMotionTrack(${num(t.from)}, [${segments.join(", ")}])`;
    });
    return `MarkswiftMotion(${[timingExpr(k), ...tracks].join(", ")})`;
  });
  return `[${items.join(", ")}]`;
}

/** `.modifier(MarkswiftAnimation(…))`: `reduced` only when it differs, `base` only for non-identity channels, `anchor` only off-centre. */
export function animationModifier(motion: Motion): string {
  const args = [`motions: ${motionList(motion.animations ?? [])}`];
  if (motion.reduced) args.push(`reduced: ${motionList(motion.reduced)}`);
  const base = CHANNELS.filter((c) => motion.base?.[c] !== undefined && motion.base[c] !== IDENTITY[c]);
  if (base.length)
    args.push(`base: MarkswiftMotionValue(${base.map((c) => `${MEMBER[c]}: ${num(motion.base![c]!)}`).join(", ")})`);
  if (motion.anchor) args.push(`anchor: UnitPoint(x: ${num(motion.anchor[0])}, y: ${num(motion.anchor[1])})`);
  return `.modifier(MarkswiftAnimation(${args.join(", ")}))`;
}

/** A transition's SwiftUI `Animation` (`nil` = jump): bezier as `.timingCurve`, steps()/linear() via `MarkswiftEasing`. */
export function animationExpr(spec?: TransitionSpec): string {
  if (!spec) return "nil";
  const s = num(spec.duration / 1000);
  const e = spec.easing;
  const base =
    "bezier" in e
      ? `.timingCurve(${e.bezier.map(num).join(", ")}, duration: ${s})`
      : `Animation(MarkswiftEasing(duration: ${s}, ease: ${easeExpr(e)}))`;
  return spec.delay > 0 ? `${base}.delay(${num(spec.delay / 1000)})` : base;
}

/** `.modifier(MarkswiftStateAnimation(…))` for one paint field of a pressed/focused look. */
export function stateAnimation(cond: string, t: StateTransition | undefined, field: StateField): string {
  const [into, back, reducedInto, reducedBack] = [t?.in, t?.out, t?.reduced.in, t?.reduced.out].map((m) =>
    animationExpr(m?.[field]),
  );
  return `.modifier(MarkswiftStateAnimation(isOn: ${cond}, into: ${into}, back: ${back}, reducedInto: ${reducedInto}, reducedBack: ${reducedBack}))`;
}

/** A layer root's exit as one curve: its duration, delay and first segment's easing. */
function exitSpec(k: KeyframeMotion): TransitionSpec {
  const easing = Object.values(k.tracks)[0]!.segments[0]!.easing;
  return { duration: k.duration, delay: Math.max(0, k.delay), easing };
}

/**
 * An overlay root's removal with its exit: the frame its keyframes end at, relative to where they start (opacity and
 * scale as factors, offset and rotation as differences), and under Reduce Motion that frame's opacity only.
 */
function exitExpr(motion: Motion): string {
  const { tracks } = motion.exit!.motion;
  const rel: Partial<Record<MotionChannel, number>> = {};
  for (const c of CHANNELS) {
    const t = tracks[c];
    if (!t) continue;
    const end = t.segments.at(-1)?.to ?? t.from;
    rel[c] = c === "opacity" || c === "sx" || c === "sy" ? (t.from ? end / t.from : end) : end - t.from;
  }
  const value = (cs: MotionChannel[]) =>
    `MarkswiftMotionValue(${cs
      .filter((c) => rel[c] !== undefined && rel[c] !== IDENTITY[c])
      .map((c) => `${MEMBER[c]}: ${num(rel[c]!)}`)
      .join(", ")})`;
  const anchor = motion.anchor ? `, anchor: UnitPoint(x: ${num(motion.anchor[0])}, y: ${num(motion.anchor[1])})` : "";
  return `.asymmetric(insertion: .identity, removal: .modifier(active: MarkswiftExitFrame(value: ${value(CHANNELS)}, reduced: ${value(["opacity"])}${anchor}), identity: MarkswiftExitFrame()).animation(${animationExpr(exitSpec(motion.exit!.motion))}))`;
}

/** The `Animation` of the longest exit among a layer's roots (what closing it waits for); undefined when none exits. */
export function longestExit(roots: SemNode[]): string | undefined {
  const exits = roots.flatMap((n) => (n.motion?.exit ? [n.motion.exit.motion] : []));
  if (!exits.length) return undefined;
  const end = (k: KeyframeMotion) => Math.max(0, k.delay) + k.duration;
  return animationExpr(exitSpec(exits.reduce((a, b) => (end(b) > end(a) ? b : a))));
}

/** In-flow content's insertion/removal: the revealed height animates (`withAnimation` around the toggle times it). */
const REVEAL = ".modifier(active: MarkswiftReveal(fraction: 0), identity: MarkswiftReveal(fraction: 1))";

/** `.transition(…)` of a layer root: in-flow content's reveal and/or an overlay root's exit; none when neither. */
export function transitionModifiers(n: SemNode): string[] {
  const parts = [...(n.motion?.reveal ? [REVEAL] : []), ...(n.motion?.exit ? [exitExpr(n.motion)] : [])];
  if (!parts.length) return [];
  return [`.transition(${parts.length > 1 ? `${parts[0]}.combined(with: ${parts[1]})` : parts[0]})`];
}

/** An in-flow layer's toggle: `state.toggle()` inside the reveal's close or open curve, when it has one. */
export function revealToggle(state: string, reveal: Motion["reveal"]): string {
  if (!reveal) return `${state}.toggle()`;
  return `withAnimation(${state} ? ${animationExpr(reveal.close)} : ${animationExpr(reveal.open)}) { ${state}.toggle() }`;
}
