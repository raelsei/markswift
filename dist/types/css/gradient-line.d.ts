/** CSS physical linear-gradient geometry, before normalized view coordinates stretch it. */
export type GradientCorner = [-1 | 1, -1 | 1];
export interface GradientLine {
    direction: [number, number];
    length: number;
    start: [number, number];
    end: [number, number];
}
/** Corner keywords point perpendicular to the neighboring-corner line, not at a fixed angle. */
export declare function linearGradientLine(angle: number, w: number, h: number, corner?: GradientCorner): GradientLine;
