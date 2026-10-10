/** IR value types: what the parsers in css/ produce and the emitters consume. No parsing here. */

/** sRGB color, channels 0..1 (wide-gamut inputs are gamut-clipped). */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Every CSS `<blend-mode>` keyword (`mix-blend-mode`, `background-blend-mode`). Each one is a
 * separable or non-separable blend function the CSS compositing spec takes verbatim from the
 * PDF blend model, which is also what CoreGraphics — and therefore SwiftUI's `BlendMode` —
 * implements, so the set maps one to one onto the platform.
 */
export const BLEND_MODES = {
  normal: true,
  multiply: true,
  screen: true,
  overlay: true,
  darken: true,
  lighten: true,
  "color-dodge": true,
  "color-burn": true,
  "hard-light": true,
  "soft-light": true,
  difference: true,
  exclusion: true,
  hue: true,
  saturation: true,
  color: true,
  luminosity: true,
  "plus-lighter": true,
  "plus-darker": true,
} as const satisfies Record<string, true>;

export type BlendMode = keyof typeof BLEND_MODES;

export interface GradientStop {
  color: Color;
  /** 0..1 along the gradient line, undefined = evenly distributed. */
  pos?: number;
  /** Absolute px along the gradient line; `resolvePaint` turns it into `pos` once the box is known. */
  px?: number;
}

/** Px from the node's border-box edge to a fill's painting area (top, right, bottom, left). */
export type PaintInset = {
  inset?: [number, number, number, number];
  /** `background-blend-mode` for this layer, against the layers below it. Absent = `normal`. */
  blend?: BlendMode;
};

/**
 * One `background-image` layer (or a solid `background-color`). Gradient variants carry
 * `repeating: true` for `repeating-*-gradient`; `center` is a 0..1 fraction of the box;
 * `space` is the colour space of an explicit `in <space>` clause. A linear `corner`
 * (`to right top` = [1, -1]) keeps the square-box `angle` until `resolvePaint` knows the box.
 * Image layers carry the resolved `background-size`/`position`/`repeat` (px, box-relative)
 * when the producer knows the box; absent = fill the box. `inset` (any fill) is set for
 * `background-clip: padding-box | content-box`.
 */
export type Paint =
  | ({ kind: "solid"; color: Color } & PaintInset)
  | ({ kind: "linear"; angle: number; corner?: [x: 1 | -1, y: 1 | -1]; stops: GradientStop[]; repeating?: true; space?: string } & PaintInset)
  | ({ kind: "radial"; stops: GradientStop[]; center: [number, number]; ellipse: boolean; repeating?: true; space?: string } & PaintInset)
  | ({ kind: "conic"; stops: GradientStop[]; from: number; center: [number, number]; repeating?: true; space?: string } & PaintInset)
  | ({ kind: "image"; url: string; size?: BackgroundSize; position?: [number, number]; repeat?: BackgroundRepeat } & PaintInset)
  | { kind: "unsupported"; raw: string };

/** `background-repeat` per layer; `space`/`round` collapse to `repeat`. */
export type BackgroundRepeat = "no-repeat" | "repeat" | "repeat-x" | "repeat-y";

/** Resolved `background-size` layer: explicit px box or the `cover`/`contain` keywords. */
export type BackgroundSize = { w: number; h: number } | "cover" | "contain";

export interface Shadow {
  color: Color;
  x: number;
  y: number;
  blur: number;
  spread: number;
  inset: boolean;
}

/**
 * 2D affine transform decomposed as `translate(tx, ty) · rotate(rotate) · skewX(skewX) ·
 * skewY(skewY) · scale(scaleX, scaleY)`. Angles in degrees; `skewX`/`skewY` are present
 * only when the matrix has shear (a pure Y shear reports `skewY`, any other shear `skewX`).
 * `flattened` marks a 3D matrix reduced to its x/y projection (depth and perspective lost).
 */
export interface Transform2D {
  rotate: number;
  scaleX: number;
  scaleY: number;
  tx: number;
  ty: number;
  skewX?: number;
  skewY?: number;
  flattened?: true;
}
