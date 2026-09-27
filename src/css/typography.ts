/** Pure typography interpretation of browser-resolved CSS values. */
import { splitTop } from "./syntax.ts";


/** Numeric font-weight from computed value (`700`, `bold`, `normal`). */
export function fontWeight(s: string | undefined): number {
  if (!s) return 400;
  if (s === "bold") return 700;
  if (s === "normal") return 400;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 400;
}


/** First family in a computed font-family list, unquoted. */
export function fontFamilies(s: string | undefined): string[] {
  if (!s) return [];
  return splitTop(s, ",").map((f) => f.replace(/^["']|["']$/g, "").trim());
}
