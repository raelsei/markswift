/** A proven CSS main-axis allocation in border-box points. */
export interface AllocationTrack {
    basis: number;
    /** Authored fraction of the offered inner width before gaps, added to the pixel basis. */
    basisFraction?: number;
    grow: number;
    shrink: number;
    min: number;
    max?: number;
    /** Padding and border excluded from the CSS scaled shrink factor. */
    inset?: number;
}
