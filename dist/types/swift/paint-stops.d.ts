import type { Paint } from "../css/paint.ts";
type LiveGradient = Extract<Paint, {
    kind: "linear" | "radial";
}>;
/** Extending a static radial field preserves color positions beyond its ending radius. */
export declare function radialStyleStops(paint: Extract<Paint, {
    kind: "radial";
}>): {
    stops: typeof paint.stops;
    scale: number;
};
export declare function gradientStopArguments(paint: LiveGradient): string;
export {};
