import type { Raw } from "./snapshot-types.ts";

/** Written on `<img>` when the browser chose a `srcset`/`<picture>` candidate other than `src`. */
export const CURRENT_SRC_ATTR = "data-h2s-src";

/**
 * Records the `srcset`/`<picture>` candidate the browser actually loaded as
 * `data-h2s-src`, spelled as authored (so it stays a bundlable path), when it
 * is not the plain `src`. Falls back to the absolute URL if no candidate matches.
 */
export function markCurrentSrc(img: Raw, currentSrc: string, base: string): void {
  if (!currentSrc) return;
  const resolve = (u: string) => {
    try {
      return new URL(u, base).href;
    } catch {
      return u;
    }
  };
  const src = img.attrs["src"];
  if (src !== undefined && resolve(src) === currentSrc) return;
  const candidates = srcsetUrls(img.attrs["srcset"] ?? "");
  if (img.parent?.name === "picture") {
    for (const s of img.parent.children) if (s.type === 1 && s.name === "source") candidates.push(...srcsetUrls(s.attrs["srcset"] ?? ""));
  }
  img.attrs[CURRENT_SRC_ATTR] = candidates.find((c) => resolve(c) === currentSrc) ?? currentSrc;
}

/** Candidate URLs of a `srcset` (HTML spec tokenisation: URLs are whitespace-free, descriptors run to the next comma). */
export function srcsetUrls(srcset: string): string[] {
  const out: string[] = [];
  const n = srcset.length;
  let i = 0;
  while (i < n) {
    while (i < n && /[\s,]/.test(srcset[i]!)) i++;
    const start = i;
    while (i < n && !/\s/.test(srcset[i]!)) i++;
    const url = srcset.slice(start, i);
    if (!url) break;
    if (url.endsWith(",")) out.push(url.replace(/,+$/, ""));
    else {
      out.push(url);
      while (i < n && srcset[i] !== ",") i++;
    }
  }
  return out;
}
