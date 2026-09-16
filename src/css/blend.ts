/** Pure blend interpretation of browser-resolved CSS values. */
import { splitTop } from "./syntax.ts";


/**
 * Every CSS `<blend-mode>` keyword (`mix-blend-mode`, `background-blend-mode`). Each one is a
 * separable or non-separable blend function the CSS compositing spec takes verbatim from the
 * PDF blend model, which is also what CoreGraphics — and therefore SwiftUI's `BlendMode` —
 * implements, so the set maps one to one onto the platform.
 */
const BLEND_MODES = {
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


/** One `<blend-mode>` keyword; `undefined` for anything outside the spec's list. */
export function parseBlendMode(s: string | undefined): BlendMode | undefined {
  const t = s?.trim().toLowerCase();
  return t && t in BLEND_MODES ? (t as BlendMode) : undefined;
}


/**
 * `background-blend-mode`: one keyword per background layer, in CSS layer order (top-most
 * first), cycled by the caller when there are more layers than keywords. An unrecognised
 * keyword yields `normal` so a layer is never silently dropped.
 */
export function parseBlendModes(s: string | undefined): BlendMode[] {
  if (!s) return [];
  return splitTop(s, ",").map((t) => parseBlendMode(t) ?? "normal");
}
