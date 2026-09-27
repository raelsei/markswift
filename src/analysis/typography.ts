/** Computed font selection with conversion-scoped bundled families. */
import { type BundledFamilies } from "../model/fonts.ts";
import { type FontSpec } from "../model/semantic.ts";
import { round2, px, fontWeight, fontFamilies } from "../css/index.ts";
import { selectStaticFontFace } from "./static-font-selection.ts";
import { selectOpticalSize } from "./optical-sizing.ts";

const SYSTEM_KEYWORDS = new Set(["-apple-system", "blinkmacsystemfont", "cursive", "fantasy", "monospace", "sans-serif", "serif", "system-ui", "ui-monospace", "ui-rounded", "ui-sans-serif", "ui-serif"]);

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
      const optical = selectOpticalSize(s, bundled);
      if (optical.kind === "none") spec.opsz = optical.value;
      const selection = selectStaticFontFace(capturedWeight(s), bundled.faces, s);
      if (selection.kind === "static") spec.staticFace = { postScriptName: selection.face.postScriptName, assetHash: selection.face.assetHash, matchedWeight: selection.matchedWeight };
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

/** Mode-independent provenance note: app keeps its existing Dynamic Type font matching. */
export function fontSelectionDiagnostic(s: Record<string, string>, families: BundledFamilies = {}): string | undefined {
  for (const family of fontFamilies(s["font-family"])) {
    const bundled = families[family];
    if (bundled) {
      const optical = selectOpticalSize(s, bundled);
      if (optical.kind === "none") return `approximated: font-family ${family} optical sizing uses its actual fvar default for fidelity; app Dynamic Type retains platform optical behavior, whose explicit source coordinate is unproved`;
      if (optical.kind === "unavailable") return `approximated: font-family ${family} optical sizing: ${optical.reason}; existing automatic coordinate route retained`;
      const selection = selectStaticFontFace(capturedWeight(s), bundled.faces, s);
      if (selection.kind === "variable") return undefined;
      return selection.kind === "static"
        ? `approximated: font-family ${family} has a CSS-selected static source face for fidelity; app Dynamic Type still uses platform family/weight matching, whose CSS face identity is unproved`
        : `approximated: font-family ${family} static face matching: ${selection.reason}; existing platform family/weight route retained`;
    }
    const lower = family.toLowerCase(), design = SYSTEM_DESIGNS[lower];
    if (design) return SYSTEM_KEYWORDS.has(lower) ? undefined
      : `approximated: concrete font-family ${family} → SwiftUI .${design} design; the captured installed face identity is not preserved`;
  }
  return undefined;
}

/** Legacy defaulting remains in FontSpec; it cannot establish a captured static-face request. */
function capturedWeight(s: Record<string, string>): number {
  const raw = s["font-weight"];
  return raw === "normal" ? 400 : raw === "bold" ? 700 : raw?.trim() ? Number(raw) : NaN;
}
