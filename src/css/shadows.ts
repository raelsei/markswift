/** Pure shadows interpretation of browser-resolved CSS values. */
import { parseColor, TRANSPARENT } from "./color.ts";
import type { Shadow } from "../model/values.ts";
import { splitTop } from "./syntax.ts";
import { COLOR_TOKEN } from "./paint.ts";


/** Computed `box-shadow`: `rgba(…) 0px 12px 34px 0px[, …][ inset]`. `dropped` collects the shadows it could not read. */
export function parseShadows(s: string | undefined, dropped?: string[]): Shadow[] {
  if (!s || s === "none") return [];
  const out: Shadow[] = [];
  for (const part of splitTop(s, ",")) {
    const inset = /\binset\b/.test(part);
    const body = part.replace(/\binset\b/, "").trim();
    const m = new RegExp(String.raw`^(${COLOR_TOKEN})\s+([-\d.]+)px\s+([-\d.]+)px(?:\s+([-\d.]+)px)?(?:\s+([-\d.]+)px)?`, "i").exec(body);
    if (!m) {
      dropped?.push(part.trim().slice(0, 40));
      continue;
    }
    out.push({ color: parseColor(m[1]!) ?? TRANSPARENT, x: +m[2]!, y: +m[3]!, blur: +(m[4] ?? 0), spread: +(m[5] ?? 0), inset });
  }
  return out;
}
