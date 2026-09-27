import { type Color } from "./color.ts";
export declare const COLOR_TOKEN: string;
export interface GradientStop {
    color: Color;
    pos?: number;
    px?: number;
}
/** Null is an authored omitted position, not a captured inferred fraction. */
export type GradientStopPosition = {
    unit: "px" | "fraction";
    value: number;
} | null;
type GradientKind = "linear" | "radial" | "conic";
/** The live radial path is bounded to nonnegative positions; repetition is separate. */
export declare function liveGradientStopPositions(paint: {
    kind: string;
    stops: readonly GradientStop[];
    stopPositions?: GradientStopPosition[];
    repeating?: boolean;
}): GradientStopPosition[] | undefined;
export declare function authoredStopPositions(stops: readonly GradientStop[]): GradientStopPosition[];
/** CSS Images fixup: endpoints, nondecreasing specified stops, then omitted runs. */
export declare function resolveStopPositions(source: readonly GradientStopPosition[], length: number): number[] | undefined;
/** No argument is discarded: hints and unresolved lengths explicitly decline. */
export declare function parseGradientStops(args: readonly string[], kind: GradientKind): GradientStop[] | undefined;
export {};
