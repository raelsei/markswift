import type { LayoutNode } from "../model/layout.ts";

/** CoreText's ordinary system face does not reproduce authored OpenType/axis/bidi overrides. */
const ordinarySettings: ReadonlyArray<readonly [string, RegExp]> = [
  ["font-kerning", /^(auto|normal)$/],
  ["font-feature-settings", /^normal$/], ["font-variation-settings", /^normal$/],
  ["font-variant-ligatures", /^normal$/], ["font-variant-caps", /^normal$/],
  ["font-variant-east-asian", /^normal$/], ["font-variant-position", /^normal$/],
  ["font-variant-alternates", /^normal$/], ["font-variant-numeric", /^normal$/],
  ["font-optical-sizing", /^auto$/], ["font-size-adjust", /^none$/],
  // Chromium currently exposes the width axis through this canonical percentage.
  ["font-stretch", /^100%$/],
  ["font-synthesis", /^weight style small-caps$/],
  // HTML block/list UA isolation is width-neutral for the admitted LTR ASCII words.
  ["unicode-bidi", /^(normal|isolate)$/],
];

/** Missing old-capture metadata is not evidence of the native defaults. */
export function intrinsicFontSettingsReason(node: LayoutNode): string | undefined {
  if (node.styles.display === "none") return;
  if (node.tag !== "#text") for (const [property, allowed] of ordinarySettings) {
    const value = node.styles[property];
    if (value === undefined) return `font setting metadata unavailable (${property})`;
    if (!allowed.test(value)) return `unsupported ${property}:${value}`;
  }
  // Older Chromium leaves the not-yet-supported alias empty. A nonempty unknown
  // value is not evidence that our unmodified system face reproduces the width.
  const width = node.styles["font-width"];
  if (node.tag !== "#text" && width && width !== "100%") return `unsupported font-width:${width}`;
  // A single semantic run can merge spans whose unrepresented font settings differ.
  for (const child of node.children) {
    const reason = intrinsicFontSettingsReason(child);
    if (reason) return reason;
  }
}
