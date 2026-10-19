/** Computed font selection with conversion-scoped bundled families. */
import { type BundledFamilies, type BundledFamily } from "../model/fonts.ts";
import { type FontSpec } from "../model/semantic.ts";
import { round2, px, fontWeight, fontFamilies, fontStretch, variationSettings } from "../css/index.ts";

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
 * reports by name. `font-variation-settings` applies last and wins per axis (CSS Fonts 4 §7):
 * `wght` → weight, `opsz` → opsz, other axes the bundled file declares (`wdth` also from
 * `font-stretch`) → `axes`; a system family keeps `font-stretch`/`wdth` as `stretch`.
 */
export function fontOf(s: Record<string, string>, families: BundledFamilies = {}, resolvedFont?: string): FontSpec {
  const size = round2(px(s["font-size"]));
  const spec: FontSpec = { family: { kind: "system", design: "default" }, size, weight: fontWeight(s["font-weight"]) };
  const requestedStretch = fontStretch(s["font-stretch"]);
  let bundled: BundledFamily | undefined;
  for (const family of fontFamilies(s["font-family"])) {
    bundled = families[family];
    if (bundled) {
      const rank = ([lo, hi]: [number, number]): [number, number] => {
        if (requestedStretch >= lo && requestedStretch <= hi) return [0, 0];
        return requestedStretch <= 100
          ? hi < requestedStretch
            ? [1, requestedStretch - hi]
            : [2, lo - requestedStretch]
          : lo > requestedStretch
            ? [1, lo - requestedStretch]
            : [2, requestedStretch - hi];
      };
      const chosen = [...(bundled.widths ?? [])].sort((a, b) => {
        const x = rank(a.stretch),
          y = rank(b.stretch);
        return x[0] - y[0] || x[1] - y[1];
      })[0];
      const name = chosen?.name ?? family;
      bundled = families[name] ?? bundled;
      spec.family = bundled.wght ? { kind: "custom", name } : { kind: "custom", name, static: true };
      break;
    }
    const design = SYSTEM_DESIGNS[family.toLowerCase()];
    if (design) {
      spec.family = { kind: "system", design };
      break;
    }
  }
  // Menlo ships on the supported Apple targets. Only use it when the browser measured that face;
  // a generic monospace stack on another platform retains the existing diagnosed fallback.
  if (!bundled && resolvedFont === "Menlo") spec.family = { kind: "custom", name: "Menlo", static: true };
  const fvs = variationSettings(s["font-variation-settings"]);
  const stretch = fvs["wdth"] ?? fontStretch(s["font-stretch"]);
  const wght = fvs["wght"];
  if (wght !== undefined && (spec.family.kind === "system" || bundled?.wght)) {
    const r = bundled?.wght ?? [1, 1000];
    spec.weight = Math.min(r[1], Math.max(r[0], wght));
  }
  if (bundled?.opsz) {
    const v = fvs["opsz"] ?? (s["font-optical-sizing"] === "none" ? undefined : size);
    if (v !== undefined) spec.opsz = Math.min(bundled.opsz[1], Math.max(bundled.opsz[0], v));
  }
  const axes: Record<string, number> = {};
  for (const [tag, r] of Object.entries(bundled?.axes ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const v = tag === "wdth" ? stretch : fvs[tag];
    if (v !== undefined && (tag !== "wdth" || v !== 100)) axes[tag] = Math.min(r[1], Math.max(r[0], v));
  }
  if (spec.family.kind === "system") {
    Object.assign(axes, fvs);
    if (stretch !== 100) axes.wdth = stretch;
  }
  if (Object.keys(axes).length) spec.axes = axes;
  if (spec.family.kind === "system" && stretch !== 100) spec.stretch = stretch;
  const lh = s["line-height"];
  if (lh && lh !== "normal") spec.lineHeight = round2(px(lh));
  return spec;
}
