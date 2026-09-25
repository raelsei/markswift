/**
 * One `border-*-radius` corner → horizontal radius in px: `26px`, `50%` (of `refPx`),
 * or the first value of the elliptical `24px 12px` form.
 */
export declare function parseRadius(s: string | undefined, refPx?: number): number;
/**
 * One `border-*-radius` corner → `[horizontal, vertical]` px. A single value applies to
 * both axes; `%` resolves against `refW` (horizontal) / `refH` (vertical) as in CSS.
 */
export declare function parseRadiusXY(s: string | undefined, refW: number, refH: number): [number, number];
