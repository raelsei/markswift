/** Pure typography interpretation of browser-resolved CSS values. */
import { splitTop } from "./syntax.ts";

/** Numeric font-weight from computed value (`700`, `bold`, `normal`). */
export function fontWeight(s: string | undefined): number {
  if (!s) return 400;
  if (s === "bold") return 700;
  if (s === "normal") return 400;
  const v = parseInt(s, 10);
  return Number.isFinite(v) ? v : 400;
}

/** First family in a computed font-family list, unquoted. */
export function fontFamilies(s: string | undefined): string[] {
  if (!s) return [];
  return splitTop(s, ",").map((f) => f.replace(/^["']|["']$/g, "").trim());
}

/** Computed `font-variation-settings` (`"GRAD" -20, "wght" 650`) → axis tag → value; `normal` → {}. */
export function variationSettings(s: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of (s ?? "").matchAll(/["']([\x20-\x7e]{4})["']\s+(-?[\d.]+(?:e[+-]?\d+)?)/g)) out[m[1]!] = Number(m[2]);
  return out;
}

/** Computed `font-stretch` in % (Chrome serialises keywords as `75%`); 100 when absent or unparsable. */
export function fontStretch(s: string | undefined): number {
  const v = parseFloat(s ?? "");
  return s?.endsWith("%") && Number.isFinite(v) ? v : 100;
}
