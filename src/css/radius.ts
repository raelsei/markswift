/** Pure radius interpretation of browser-resolved CSS values. */
import { splitTop, resolveLength } from "./syntax.ts";

/**
 * One `border-*-radius` corner → `[horizontal, vertical]` px. A single value applies to
 * both axes; `%` resolves against `refW` (horizontal) / `refH` (vertical) as in CSS.
 */
export function parseRadiusXY(s: string | undefined, refW: number, refH: number): [number, number] {
  if (!s) return [0, 0];
  const [x = "", y] = splitTop(s, " ");
  return [resolveLength(x, refW) ?? 0, resolveLength(y ?? x, refH) ?? 0];
}
