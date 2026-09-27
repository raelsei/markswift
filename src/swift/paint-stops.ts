import type { Paint } from "../css/paint.ts";
import { liveGradientStopPositions } from "../css/gradient-stops.ts";
import { num } from "./format.ts";

type LiveGradient = Extract<Paint, { kind: "linear" | "radial" }>;
/** Extending a static radial field preserves color positions beyond its ending radius. */
export function radialStyleStops(paint: Extract<Paint, { kind: "radial" }>): { stops: typeof paint.stops; scale: number } {
  const scale = paint.repeating ? 1 : Math.max(1, paint.stops.at(-1)?.pos ?? 1);
  return { scale, stops: scale === 1 ? paint.stops : paint.stops.map(stop => ({ ...stop, pos: (stop.pos ?? 0) / scale })) };
}
export function gradientStopArguments(paint: LiveGradient): string {
  const positions = liveGradientStopPositions(paint);
  if (!positions) return "";
  const values = positions.map(position => position === null ? "nil"
    : `.${position.unit === "px" ? "points" : "fraction"}(${num(position.value)})`);
  return `, stopPositions: [${values.join(", ")}]`;
}
