import { parseColor, type Color } from "./color.ts";

export const COLOR_TOKEN = String.raw`(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]+|transparent`;
export interface GradientStop { color: Color; pos?: number; px?: number }
/** Null is an authored omitted position, not a captured inferred fraction. */
export type GradientStopPosition = { unit: "px" | "fraction"; value: number } | null;
type GradientKind = "linear" | "radial" | "conic";

/** The live radial path is bounded to nonnegative positions; repetition is separate. */
export function liveGradientStopPositions(paint: { kind: string; stops: readonly GradientStop[]; stopPositions?: GradientStopPosition[]; repeating?: boolean }): GradientStopPosition[] | undefined {
  const positions = paint.stopPositions;
  if (paint.kind !== "linear" && paint.kind !== "radial" || paint.repeating || !positions || positions.length !== paint.stops.length) return;
  return positions.every(position => position === null || (position.unit === "px" || position.unit === "fraction")
    && Number.isFinite(position.value) && (paint.kind !== "radial" || position.value >= 0)) ? positions : undefined;
}

export function authoredStopPositions(stops: readonly GradientStop[]): GradientStopPosition[] {
  return stops.map(stop => stop.px !== undefined ? { unit: "px", value: stop.px }
    : stop.pos !== undefined ? { unit: "fraction", value: stop.pos } : null);
}

/** CSS Images fixup: endpoints, nondecreasing specified stops, then omitted runs. */
export function resolveStopPositions(source: readonly GradientStopPosition[], length: number): number[] | undefined {
  if (source.length < 2 || !Number.isFinite(length) || length < 0) return;
  const values = source.map(position => position === null ? undefined : position.unit === "px"
    ? length > 0 ? position.value / length : 0 : position.value);
  if (values.some(value => value !== undefined && !Number.isFinite(value))) return;
  values[0] ??= 0;
  values[values.length - 1] ??= 1;
  let greatest = -Infinity;
  for (let index = 0; index < values.length; index++) if (values[index] !== undefined) {
    greatest = Math.max(greatest, values[index]!); values[index] = greatest;
  }
  for (let index = 1; index < values.length - 1; index++) if (values[index] === undefined) {
    const first = index - 1;
    let end = index; while (values[end] === undefined) end++;
    const left = values[first]!, right = values[end]!;
    for (let at = index; at < end; at++) values[at] = left + (right - left) * (at - first) / (end - first);
    index = end;
  }
  return values as number[];
}

function positionOf(token: string, kind: GradientKind): Omit<GradientStop, "color"> | undefined {
  const match = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(%|px|deg|rad|grad|turn)?$/i.exec(token);
  if (!match) return;
  const value = Number(match[1]), unit = match[2]?.toLowerCase();
  if (!Number.isFinite(value) || !unit && value !== 0) return;
  if (unit === "%") return { pos: value / 100 };
  if (kind !== "conic") return unit === "px" || !unit ? { px: value } : undefined;
  if (!unit) return { pos: 0 };
  const divisors: Record<string, number> = { deg: 360, rad: 2 * Math.PI, grad: 400, turn: 1 };
  return divisors[unit] === undefined ? undefined : { pos: value / divisors[unit]! };
}

/** No argument is discarded: hints and unresolved lengths explicitly decline. */
export function parseGradientStops(args: readonly string[], kind: GradientKind): GradientStop[] | undefined {
  const stops: GradientStop[] = [];
  for (const argument of args) {
    const match = new RegExp(String.raw`^(${COLOR_TOKEN})(.*)$`, "i").exec(argument.trim());
    if (!match) return;
    const color = parseColor(match[1]!);
    if (!color) return;
    const tokens = match[2]!.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 2) return;
    if (!tokens.length) stops.push({ color });
    else for (const token of tokens) {
      const position = positionOf(token, kind); if (!position) return;
      stops.push({ color, ...position });
    }
  }
  if (stops.length < 2) return;
  if (!stops.some(stop => stop.px !== undefined)) {
    const positions = resolveStopPositions(authoredStopPositions(stops), 1)!;
    stops.forEach((stop, index) => stop.pos = positions[index]);
  }
  return stops;
}
