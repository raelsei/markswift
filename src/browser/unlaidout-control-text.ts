import type { TextSourceCapture } from "../model/text-source.ts";

/** A missing text layout is a capture limitation, not permission to invent a native glyph. */
export function unlaidOutControlTextWarnings(capture: TextSourceCapture | undefined): string[] {
  if (!capture) return [];
  const warnings: string[] = [];
  for (const source of capture.occurrences) {
    if (source.kind !== "text" || source.origin !== "dom" || source.join !== "verified" || source.layoutPresent) continue;
    if (source.ancestors.some(ancestor => ancestor.display === "none" || /^(script|style|template|noscript)$/.test(ancestor.tag))) continue;
    // HT, LF and CR are document whitespace; analysis handles their white-space policy.
    const controls = [...new Set(source.raw.match(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g) ?? [])];
    if (!controls.length) continue;
    const names = controls.map(control => `U+${control.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(", ");
    warnings.push(`Source text ${source.key} contains ${names} without a measured text layout; its raw source is retained, native control-glyph rendering remains unproved`);
  }
  return warnings;
}
