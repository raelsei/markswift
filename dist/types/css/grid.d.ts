/** Browser-resolved grid tracks; authored repeat/fr/subgrid values remain unresolved. */
export declare function resolvedGridTracks(value: string | undefined): number[] | undefined;
export type FractionGridTrack = {
    fixed: number;
} | {
    fraction: number;
    minimum?: number;
};
/** Preserve Typed OM track intent; never recover fractions from used pixel widths. */
export declare function fractionGridTracks(value: string | undefined): FractionGridTrack[] | undefined;
/** Definite pixel rows or content-driven auto rows; no intrinsic or relative track guesses. */
export declare function gridRowTracks(value: string | undefined): Array<number | null> | undefined;
