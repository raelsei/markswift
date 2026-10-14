import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mimeType } from "../input/mime.ts";

/**
 * Inline `url()`s of a compiled CSS file that are relative to that file, as data URLs. Returns the CSS and the references it could not read.
 * `--css` is injected as a `<style>` into the page, where relative URLs would otherwise resolve against the HTML document.
 * Untouched: `data:`, `#fragment`, root-relative `/…`, protocol-relative `//…` and any URL with a scheme. `@import` is not followed.
 */
export async function inlineRelativeUrls(css: string, cssPath: string): Promise<{ css: string; missing: string[] }> {
  const dir = dirname(resolve(cssPath));
  const missing: string[] = [];
  const pattern = /url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^)]*))\s*\)/g;
  const inlined: string[] = [];
  for (const match of css.matchAll(pattern)) {
    const ref = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!ref || ref.startsWith("#") || ref.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
      inlined.push(match[0]);
      continue;
    }
    const name = ref.replace(/[?#].*$/, "");
    let bytes: Buffer;
    try {
      bytes = await readFile(resolve(dir, decodeURIComponent(name)));
    } catch {
      /* malformed escape, missing file or a directory */
      missing.push(ref);
      inlined.push(match[0]);
      continue;
    }
    inlined.push(`url("data:${mimeType(name)};base64,${bytes.toString("base64")}")`);
  }
  let i = 0;
  return { css: css.replace(pattern, () => inlined[i++]!), missing };
}
