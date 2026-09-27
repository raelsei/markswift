/** CSS physical linear-gradient geometry, before normalized view coordinates stretch it. */
export type GradientCorner = [-1 | 1, -1 | 1];

export interface GradientLine {
  direction: [number, number];
  length: number;
  start: [number, number];
  end: [number, number];
}

/** Corner keywords point perpendicular to the neighboring-corner line, not at a fixed angle. */
export function linearGradientLine(angle: number, w: number, h: number, corner?: GradientCorner): GradientLine {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { direction: [0, 0], length: 0, start: [0.5, 0.5], end: [0.5, 0.5] };
  }
  const rad = (angle * Math.PI) / 180;
  const norm = Math.hypot(w, h);
  const dx = corner ? corner[0] * h / norm : Math.sin(rad);
  const dy = corner ? corner[1] * w / norm : -Math.cos(rad);
  const length = Math.abs(w * dx) + Math.abs(h * dy);
  const x = length * dx / (2 * w), y = length * dy / (2 * h);
  return { direction: [dx, dy], length, start: [0.5 - x, 0.5 - y], end: [0.5 + x, 0.5 + y] };
}
