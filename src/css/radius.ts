/** Pure radius interpretation of browser-resolved CSS values. */
import { splitTop, resolveLength } from "./syntax.ts";


/**
 * One `border-*-radius` corner → horizontal radius in px: `26px`, `50%` (of `refPx`),
 * or the first value of the elliptical `24px 12px` form.
 */
export function parseRadius(s: string | undefined, refPx = 0): number {
  return parseRadiusXY(s, refPx, refPx)[0];
}


/**
 * One `border-*-radius` corner → `[horizontal, vertical]` px. A single value applies to
 * both axes; `%` resolves against `refW` (horizontal) / `refH` (vertical) as in CSS.
 */
export function parseRadiusXY(s: string | undefined, refW: number, refH: number): [number, number] {
  if (!s) return [0, 0];
  const [x = "", y] = splitTop(s, " ");
  return [resolveLength(x, refW) ?? 0, resolveLength(y ?? x, refH) ?? 0];
}
