/** A proven CSS main-axis allocation in border-box points. */
export interface AllocationTrack {
  basis: number;
  grow: number;
  shrink: number;
  min: number;
  max?: number;
  /** Padding and border excluded from the CSS scaled shrink factor. */
  inset?: number;
}
