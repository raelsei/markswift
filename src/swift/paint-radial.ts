import type { RadialGeometrySpec, GradientLength } from "../css/radial-gradient.ts";
import { num } from "./format.ts";

function length(value: GradientLength): string {
  return value.unit === "px" ? `.points(${num(value.value)})` : `.fraction(${num(value.value / 100)})`;
}

/** Retain CSS units so the native ending shape responds to its actual bounds. */
export function radialGradientArguments(paint: RadialGeometrySpec): string {
  const args = [`center: UnitPoint(x: ${num(paint.center[0])}, y: ${num(paint.center[1])})`, `ellipse: ${paint.ellipse}`];
  if (paint.position) args.push(`position: (${length(paint.position[0])}, ${length(paint.position[1])})`);
  if (Array.isArray(paint.size)) args.push(`extent: .explicit(${length(paint.size[0])}, ${length(paint.size[1])})`);
  else if (paint.size) args.push(`extent: .${paint.size.replace(/-([a-z])/g, (_, value: string) => value.toUpperCase())}`);
  return args.join(", ");
}
