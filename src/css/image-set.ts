import { splitTop } from "./syntax.ts";

export interface ImageSetCandidate {
  url: string;
  density: number;
}

/**
 * Parses CSS `image-set(...)` or `-webkit-image-set(...)`.
 * Candidates are separated by top-level commas and contain a `url(...)` or quoted string plus a density descriptor.
 */
export function parseImageSet(css: string): ImageSetCandidate[] | undefined {
  const m = /^(?:-webkit-)?image-set\((.*)\)$/s.exec(css.trim());
  if (!m) return undefined;
  const args = splitTop(m[1]!, ",");
  const candidates: ImageSetCandidate[] = [];
  for (const arg of args) {
    const trimmed = arg.trim();
    const urlMatch =
      /^(?:url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*))\s*\)|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/s.exec(
        trimmed,
      );
    if (!urlMatch) continue;
    const url = (urlMatch[1] ?? urlMatch[2] ?? urlMatch[3] ?? urlMatch[4] ?? urlMatch[5] ?? "")
      .replace(/\\(.)/g, "$1")
      .trim();
    const rest = trimmed.slice(urlMatch[0].length).trim();
    let density = 1;
    const densityMatch = /(\d+(?:\.\d+)?)\s*(x|dppx|dpi)/i.exec(rest);
    if (densityMatch) {
      const val = parseFloat(densityMatch[1]!);
      const unit = densityMatch[2]!.toLowerCase();
      if (unit === "x" || unit === "dppx") density = val;
      else if (unit === "dpi") density = val / 96;
    }
    candidates.push({ url, density });
  }
  return candidates.length ? candidates : undefined;
}
