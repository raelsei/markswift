import type { Page } from "playwright-core";
import type { FontFace as FontFaceRecord } from "../model/layout.ts";

/**
 * The page's `@font-face` rules, as the browser resolved them. Two sources, because neither is
 * enough on its own: `document.styleSheets` carries the authored descriptors (`src` with its
 * URLs and formats, `unicode-range`, the weight range of a variable face), while
 * `document.fonts` is the only place that says whether a face actually loaded — i.e. whether
 * the reference pixels are its glyphs or a fallback's. Runs after `settle`, so
 * `document.fonts.ready` has already resolved.
 *
 * Cross-origin stylesheets throw on `cssRules`, so their `@font-face` rules are not collected.
 */
export async function collectFontFaces(page: Page): Promise<FontFaceRecord[]> {
  return await page.evaluate(() => {
    const KEYWORD_WEIGHT: Record<string, number> = { normal: 400, bold: 700, lighter: 100, bolder: 700 };
    const weightRange = (s: string): [number, number] => {
      const parts = s.trim().split(/\s+/).filter(Boolean);
      const nums = parts.map((p) => KEYWORD_WEIGHT[p.toLowerCase()] ?? Number.parseFloat(p)).filter((n) => Number.isFinite(n));
      if (!nums.length) return [400, 400];
      return [Math.min(...nums), Math.max(...nums)];
    };
    // `src` is a comma list of `url(…) format(…)` / `local(…)`; commas inside url() or a
    // quoted string are not separators, so the split has to track depth and quotes.
    const splitSrc = (s: string): string[] => {
      const out: string[] = [];
      let depth = 0, quote = "", start = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s[i]!;
        if (quote) {
          if (c === quote && s[i - 1] !== "\\") quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === "," && depth === 0) {
          out.push(s.slice(start, i));
          start = i + 1;
        }
      }
      out.push(s.slice(start));
      return out.map((p) => p.trim()).filter(Boolean);
    };
    const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "").trim();
    const faces: FontFaceRecord[] = [];
    const visit = (rules: CSSRuleList, base: string): void => {
      for (const rule of rules) {
        if (rule instanceof CSSFontFaceRule) {
          const st = rule.style;
          const family = unquote(st.getPropertyValue("font-family"));
          if (!family) continue;
          const src: Array<{ url: string; format?: string }> = [];
          for (const entry of splitSrc(st.getPropertyValue("src"))) {
            const url = /url\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\s*\)/.exec(entry);
            if (!url) continue; // `local(<name>)`: an installed font, nothing to bundle.
            const fmt = /format\(\s*("[^"]*"|'[^']*'|[^)]*)\s*\)/.exec(entry);
            try {
              src.push({ url: new URL(unquote(url[1]!), base).href, ...(fmt ? { format: unquote(fmt[1]!) } : {}) });
            } catch {
              /* an unresolvable src is not a face we can bundle */
            }
          }
          const styleDesc = unquote(st.getPropertyValue("font-style")).split(/\s+/)[0]?.toLowerCase();
          faces.push({
            family,
            weight: weightRange(st.getPropertyValue("font-weight") || "normal"),
            style: styleDesc === "italic" || styleDesc === "oblique" ? styleDesc : "normal",
            ...(st.getPropertyValue("unicode-range") ? { unicodeRange: st.getPropertyValue("unicode-range") } : {}),
            src,
            loaded: false,
          });
        } else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules, base);
      }
    };
    for (const sheet of document.styleSheets) {
      if ((sheet.ownerNode as Element | null)?.hasAttribute?.("data-markswift-harness")) continue;
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      visit(rules, sheet.href ?? document.baseURI);
    }
    // `document.fonts` holds the same faces as live objects; a loaded one is what painted.
    const loaded = new Set<string>();
    document.fonts.forEach((f) => {
      if (f.status === "loaded") loaded.add(`${unquote(f.family).toLowerCase()}|${f.style}|${f.weight}`);
    });
    const seen = new Set<string>();
    const out: FontFaceRecord[] = [];
    for (const f of faces) {
      if (!f.src.length) continue;
      const key = `${f.family.toLowerCase()}|${f.style}|${f.weight.join(" ")}|${f.unicodeRange ?? ""}|${f.src.map((s) => s.url).join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const w = f.weight[0] === f.weight[1] ? String(f.weight[0]) : `${f.weight[0]} ${f.weight[1]}`;
      out.push({ ...f, loaded: loaded.has(`${f.family.toLowerCase()}|${f.style}|${w}`) });
    }
    return out;
  });
}

/**
 * Reads the bytes behind every non-inline `@font-face` source and names each blob by content
 * hash, mutating the faces to point at the file. Runs in-process while the source's static
 * server is still up: that server is the only thing that can answer its own ephemeral-port URL,
 * and it stops when the conversion returns.
 *
 * A source that cannot be read keeps its `url` and gets no `file` — packaging reports it rather
 * than guessing.
 */
export async function readFontBytes(faces: FontFaceRecord[], allowRemote = true): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  const byHash: Record<string, string> = {};
  for (const face of faces) {
    for (const src of face.src) {
      if (src.url.startsWith("data:")) continue;
      if (!allowRemote) continue;
      let bytes: Uint8Array;
      try {
        const res = await fetch(src.url);
        if (!res.ok) continue;
        bytes = new Uint8Array(await res.arrayBuffer());
      } catch {
        continue;
      }
      const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 12);
      if (!byHash[hash]) {
        const sig = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
        const ext = sig === "wOF2" ? "woff2" : sig === "wOFF" ? "woff" : sig === "OTTO" ? "otf" : "ttf";
        byHash[hash] = `${hash}.${ext}`;
        files.push({ name: byHash[hash]!, bytes });
      }
      src.file = `_fonts/${byHash[hash]}`;
      // The source's own server listens on an ephemeral port, so the absolute URL differs on
      // every render; the path identifies the source and keeps the capture byte-deterministic.
      if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(src.url)) src.url = new URL(src.url).pathname;
    }
  }
  return files;
}
