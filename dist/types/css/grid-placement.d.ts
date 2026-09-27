export interface GridAxisPlacement {
    start?: number;
    span: number;
}
/** Resolve numeric line/span intent, including the CSS line-conflict rules. */
export declare function gridAxisPlacement(startValue?: string, endValue?: string, explicitTracks?: number): GridAxisPlacement | undefined;
