/** Pure blend interpretation of browser-resolved CSS values. */
import { splitTop } from "./syntax.ts";
import { BLEND_MODES, type BlendMode } from "../model/values.ts";

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
