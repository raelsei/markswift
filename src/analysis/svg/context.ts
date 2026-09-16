/** Shared SVG traversal data contracts. */
import { type BundledFamilies } from "../../model/fonts.ts";
import { type LayoutNode, type Rect } from "../../model/layout.ts";
import { type SvgPath, type SvgText } from "../../model/semantic.ts";

/** Affine matrix in SVG order `[a, b, c, d, e, f]`. */
export type SvgMatrix = [number, number, number, number, number, number];

export interface SvgScope {
  /** Inherited presentation attributes, nearest ancestor wins. */
  attrs: Record<string, string>;
  /** Accumulated transform from the viewBox down to this element. */
  ctm: SvgMatrix;
  /** Product of ancestor `opacity` values. */
  opacity: number;
  /** Computed `color` of the nearest `<use>`: instanced content resolves `currentColor` against it. */
  useColor?: string;
  /** `<use>` nesting depth (cycle guard). */
  depth: number;
}

export interface SvgContext {
  bundledFamilies: BundledFamilies;
  ids: Record<string, LayoutNode>;
  notes: string[];
  vb: [number, number, number, number];
  frame: Rect;
  paths: SvgPath[];
  texts: SvgText[];
}
