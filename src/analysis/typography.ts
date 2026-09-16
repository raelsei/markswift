/** Computed font selection with conversion-scoped bundled families. */
import { type BundledFamilies } from "../model/fonts.ts";
import { type FontSpec } from "../model/semantic.ts";
import { round2, px, fontWeight, fontFamilies } from "../css/index.ts";

/**
 * Lower-case family name → the SwiftUI system design that carries it: the CSS generic families,
 * the `ui-*` keywords, the Apple system stacks (`-apple-system`, `BlinkMacSystemFont`) and the
 * concrete faces a design names next to a generic (`Menlo`, `Georgia`, …). `cursive`/`fantasy`
 * have no system design and resolve to the default one, which `buildText` reports.
 */
export const SYSTEM_DESIGNS: Record<string, "default" | "rounded" | "monospaced" | "serif"> = {
  "-apple-system": "default",
  arial: "default",
  blinkmacsystemfont: "default",
  courier: "monospaced",
  "courier new": "monospaced",
  cursive: "default",
  fantasy: "default",
  georgia: "serif",
  helvetica: "default",
  "helvetica neue": "default",
  menlo: "monospaced",
  monaco: "monospaced",
  monospace: "monospaced",
  "new york": "serif",
  "sans-serif": "default",
  serif: "serif",
  "sf mono": "monospaced",
  "sf pro": "default",
  "sf pro rounded": "rounded",
  "sf pro text": "default",
  "sfmono-regular": "monospaced",
  "system-ui": "default",
  times: "serif",
  "times new roman": "serif",
  "ui-monospace": "monospaced",
  "ui-rounded": "rounded",
  "ui-sans-serif": "default",
  "ui-serif": "serif",
};

/**
 * Font of a computed style: family, size, weight, line-height. The computed `font-family` is the
 * authored list, not the family the browser picked, so it is walked in order and the first entry
 * that resolves decides — a family the run bundled becomes `custom` (with `opsz` clamped into
 * the axis range its file declares), a generic or an Apple system stack becomes the matching
 * system design. An unresolvable list falls back to the default design, which `buildText`
 * reports by name.
 */
export function fontOf(s: Record<string, string>, families: BundledFamilies = {}): FontSpec {
  const size = round2(px(s["font-size"]));
  const spec: FontSpec = { family: { kind: "system", design: "default" }, size, weight: fontWeight(s["font-weight"]) };
  for (const family of fontFamilies(s["font-family"])) {
    const bundled = families[family];
    if (bundled) {
      spec.family = { kind: "custom", name: family };
      if (bundled.opsz) spec.opsz = Math.min(bundled.opsz[1], Math.max(bundled.opsz[0], size));
      break;
    }
    const design = SYSTEM_DESIGNS[family.toLowerCase()];
    if (design) {
      spec.family = { kind: "system", design };
      break;
    }
  }
  const lh = s["line-height"];
  if (lh && lh !== "normal") spec.lineHeight = round2(px(lh));
  return spec;
}
