import type { Raw } from "./snapshot.ts";
import { createHash } from "node:crypto";
import type { CDPSession, Page } from "playwright-core";
import type { FontFace as FontFaceRecord } from "../model/layout.ts";

/**
 * The page's `@font-face` rules, as the browser resolved them. Two sources, because neither is
 * enough on its own: `document.styleSheets` carries the authored descriptors (`src` with its
 * URLs and formats, `unicode-range`, the weight range of a variable face), while
 * `document.fonts` is the only place that says whether a face actually loaded — i.e. whether
 * the reference pixels are its glyphs or a fallback's. Runs after `settle`, so
 * `document.fonts.ready` has already resolved.
 *
 * `@import`ed sheets are followed. A cross-origin sheet throws on `cssRules`; its rules are then
 * parsed from `sheetText` (response bodies by request URL, kept by the capture) into a
 * constructable sheet. A sheet with neither is returned in `unreadable`.
 */
export async function collectFontFaces(
  page: Page,
  sheetText: Record<string, string>,
): Promise<{ faces: FontFaceRecord[]; unreadable: string[] }> {
  return await page.evaluate((sheetText) => {
    const KEYWORD_WEIGHT: Record<string, number> = { normal: 400, bold: 700, lighter: 100, bolder: 700 };
    const weightRange = (s: string): [number, number] => {
      const parts = s.trim().split(/\s+/).filter(Boolean);
      const nums = parts
        .map((p) => KEYWORD_WEIGHT[p.toLowerCase()] ?? Number.parseFloat(p))
        .filter((n) => Number.isFinite(n));
      if (!nums.length) return [400, 400];
      return [Math.min(...nums), Math.max(...nums)];
    };
    const stretchRange = (s: string): [number, number] => {
      const keywords: Record<string, number> = {
        "ultra-condensed": 50,
        "extra-condensed": 62.5,
        condensed: 75,
        "semi-condensed": 87.5,
        normal: 100,
        "semi-expanded": 112.5,
        expanded: 125,
        "extra-expanded": 150,
        "ultra-expanded": 200,
      };
      const values = s
        .trim()
        .split(/\s+/)
        .map((v) => keywords[v] ?? Number.parseFloat(v))
        .filter(Number.isFinite);
      return values.length ? [Math.min(...values), Math.max(...values)] : [100, 100];
    };
    // `src` is a comma list of `url(…) format(…)` / `local(…)`; commas inside url() or a
    // quoted string are not separators, so the split has to track depth and quotes.
    const splitSrc = (s: string): string[] => {
      const out: string[] = [];
      let depth = 0,
        quote = "",
        start = 0;
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
    const unquote = (s: string) =>
      s
        .trim()
        .replace(/^["']|["']$/g, "")
        .trim();
    const faces: FontFaceRecord[] = [];
    const unreadable: string[] = [];
    const rulesOf = (sheet: CSSStyleSheet): CSSRuleList | undefined => {
      try {
        return sheet.cssRules;
      } catch {
        /* cross-origin */
      }
      const text = sheet.href ? sheetText[sheet.href] : undefined;
      if (text === undefined) {
        unreadable.push(sheet.href ?? "inline stylesheet");
        return undefined;
      }
      // ponytail: replaceSync drops @import inside a cross-origin sheet; follow them by text if a corpus needs it.
      const parsed = new CSSStyleSheet();
      parsed.replaceSync(text);
      return parsed.cssRules;
    };
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
            stretch: stretchRange(st.getPropertyValue("font-stretch") || "normal"),
            style: styleDesc === "italic" || styleDesc === "oblique" ? styleDesc : "normal",
            ...(st.getPropertyValue("unicode-range") ? { unicodeRange: st.getPropertyValue("unicode-range") } : {}),
            src,
            loaded: false,
          });
        } else if (rule instanceof CSSImportRule) {
          if (rule.styleSheet) {
            const r = rulesOf(rule.styleSheet);
            if (r) visit(r, rule.styleSheet.href ?? base);
          }
        } else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules, base);
      }
    };
    for (const sheet of document.styleSheets) {
      if ((sheet.ownerNode as Element | null)?.hasAttribute?.("data-markswift-harness")) continue;
      const rules = rulesOf(sheet);
      if (rules) visit(rules, sheet.href ?? document.baseURI);
    }
    // `document.fonts` holds the same faces as live objects; a loaded one is what painted.
    const loaded = new Set<string>();
    document.fonts.forEach((f) => {
      if (f.status !== "loaded") return;
      const s = f.style.split(/\s+/)[0]!.toLowerCase();
      loaded.add(
        `${unquote(f.family).toLowerCase()}|${s === "italic" || s === "oblique" ? s : "normal"}|${weightRange(f.weight).join(" ")}|${stretchRange(f.stretch).join(" ")}`,
      );
    });
    const seen = new Set<string>();
    const out: FontFaceRecord[] = [];
    for (const f of faces) {
      if (!f.src.length) continue;
      const key = `${f.family.toLowerCase()}|${f.style}|${f.weight.join(" ")}|${f.stretch?.join(" ")}|${f.unicodeRange ?? ""}|${f.src.map((s) => s.url).join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...f,
        loaded: loaded.has(`${f.family.toLowerCase()}|${f.style}|${f.weight.join(" ")}|${f.stretch?.join(" ")}`),
      });
    }
    return { faces: out, unreadable };
  }, sheetText);
}

const MAX_FONT_BYTES = 25 * 1024 * 1024;

/**
 * Reads the bytes behind every non-inline `@font-face` source and names each blob by content
 * hash, mutating the faces to point at it: each returned `file` is exactly the value written to
 * `src.file`, so the bytes are keyed by `FontFace.src[].file`; the conversion never writes them to disk. Runs
 * in-process while the source's static server is still up: that server is the only thing that
 * can answer its own ephemeral-port URL, and it stops when the conversion returns.
 *
 * Only `http:`/`https:` URLs are fetched (what the capture browser itself could request; never
 * `file:`, `s3:`, `blob:`), and a response over 25 MB is skipped. `signal` aborts the fetch.
 * A source that cannot be read keeps its `url` and gets no `file` — packaging reports it rather
 * than guessing.
 */
export async function readFontBytes(
  faces: FontFaceRecord[],
  allowRemote = true,
  signal?: AbortSignal,
): Promise<Array<{ file: string; bytes: Uint8Array }>> {
  const files: Array<{ file: string; bytes: Uint8Array }> = [];
  const byHash: Record<string, string> = {};
  for (const face of faces) {
    for (const src of face.src) {
      if (src.url.startsWith("data:")) continue;
      if (!allowRemote) continue;
      if (!URL.canParse(src.url) || !["http:", "https:"].includes(new URL(src.url).protocol)) continue;
      let bytes: Uint8Array;
      try {
        const res = await fetch(src.url, { signal, redirect: "follow" });
        if (!res.ok || Number(res.headers.get("content-length") ?? 0) > MAX_FONT_BYTES) continue;
        // ponytail: chunked responses are read fully before the size check; stream with a byte counter if hosts abuse it.
        bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > MAX_FONT_BYTES) continue;
      } catch (error) {
        if (signal?.aborted) throw error;
        continue;
      }
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
      if (!byHash[hash]) {
        const sig = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
        const ext = sig === "wOF2" ? "woff2" : sig === "wOFF" ? "woff" : sig === "OTTO" ? "otf" : "ttf";
        byHash[hash] = `_fonts/${hash}.${ext}`;
        files.push({ file: byHash[hash]!, bytes });
      }
      src.file = byHash[hash];
      // The source's own server listens on an ephemeral port, so the absolute URL differs on
      // every render; the path identifies the source and keeps the capture byte-deterministic.
      if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/)/.test(src.url)) src.url = new URL(src.url).pathname;
    }
  }
  return files;
}

/** Query only monospace text hosts; a mixed fallback run must not be relabelled as one face. */
export async function attachResolvedFonts(cdp: CDPSession, tree: Raw): Promise<void> {
  const hosts: Raw[] = [];
  const walk = (n: Raw): void => {
    if (
      n.type === 1 &&
      n.backend &&
      /monospace|menlo|monaco|courier|sfmono/i.test(n.styles["font-family"] ?? "") &&
      n.children.some((c) => c.type === 3 && c.text?.trim())
    )
      hosts.push(n);
    n.children.forEach(walk);
  };
  walk(tree);
  if (!hosts.length) return;
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  try {
    await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeIds } = await cdp.send("DOM.pushNodesByBackendIdsToFrontend", {
      backendNodeIds: hosts.map((n) => n.backend!),
    });
    for (const [i, nodeId] of nodeIds.entries()) {
      if (!nodeId) continue;
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      const painted = fonts.filter((f) => f.glyphCount > 0);
      if (painted.length && painted.every((f) => !f.isCustomFont && f.familyName === painted[0]!.familyName))
        hosts[i]!.resolvedFont = painted[0]!.familyName;
    }
  } finally {
    await cdp.send("CSS.disable");
    await cdp.send("DOM.disable");
  }
}
