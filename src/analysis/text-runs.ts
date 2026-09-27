/** Inline run collection, whitespace normalization and text decoration. */
import { type LayoutNode } from "../model/layout.ts";
import { type Color, parseColor } from "../css/index.ts";
import { type TextDecoration, type DecorationLine } from "../model/semantic.ts";
import { type SourceTextRun } from "./context.ts";
import { classifyElement } from "../html/policy.ts";
import { DOCUMENT_WHITESPACE } from "./document-whitespace.ts";

// ---------- text ----------

/** Inline (non-atomic) element whose subtree is nothing but text: merged into the parent's runs. */
export function isInlineText(c: LayoutNode): boolean {
  if (classifyElement(c.tag, c.attrs).atomic) return false;
  if ((c.styles["display"] ?? "inline") !== "inline") return false;
  const pos = c.styles["position"];
  if (pos === "absolute" || pos === "fixed") return false;
  return c.children.every((k) => k.tag === "#text" || k.tag === "br" || k.tag === "wbr" || isInlineText(k));
}

export function collectRuns(el: LayoutNode, runs: SourceTextRun[]): void {
  for (const k of el.children) {
    if (k.tag === "#text" || k.tag === "br" || k.tag === "wbr") runs.push({ node: k, styleOf: el });
    else collectRuns(k, runs);
  }
}

/** Split runs into groups separated by flow children (by document order → measured y/x proximity). */
export function groupRuns(host: LayoutNode, runs: SourceTextRun[]): SourceTextRun[][] {
  const groups: SourceTextRun[][] = [];
  let cur: SourceTextRun[] = [];
  let lastIdx = -2;
  const order = host.children;
  for (const r of runs) {
    const top = r.styleOf === host ? r.node : ancestorChildOf(host, r.styleOf);
    const idx = order.indexOf(top);
    if (cur.length && idx !== lastIdx + 1) {
      groups.push(cur);
      cur = [];
    }
    cur.push(r);
    lastIdx = idx;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function ancestorChildOf(host: LayoutNode, el: LayoutNode): LayoutNode {
  for (const c of host.children) if (c === el || contains(c, el)) return c;
  return el;
}

export function contains(a: LayoutNode, b: LayoutNode): boolean {
  return a.children.some((c) => c === b || contains(c, b));
}

export type Collapse = "collapse" | "preserve" | "preserve-breaks";

/** `white-space-collapse` (Chrome longhand), or the `white-space` shorthand for older snapshots. */
export function collapseOf(s: Record<string, string>): Collapse {
  const v = s["white-space-collapse"];
  if (v) return v === "collapse" ? "collapse" : v === "preserve-breaks" ? "preserve-breaks" : "preserve";
  const ws = s["white-space"] ?? "normal";
  if (ws === "pre" || ws === "pre-wrap" || ws === "break-spaces") return "preserve";
  return ws === "pre-line" ? "preserve-breaks" : "collapse";
}

/** `text-wrap-mode: nowrap` (Chrome longhand), or the `white-space` shorthand for older snapshots. */
export function noWrap(s: Record<string, string>): boolean {
  const v = s["text-wrap-mode"];
  if (v) return v === "nowrap";
  const ws = s["white-space"];
  return ws === "nowrap" || ws === "pre";
}

/**
 * Whitespace as the browser laid it out — collapsed to single spaces, or kept (breaks only, or
 * all) — plus a source map: `src[i]` is the index in `text` of the character that produced
 * output character `i`, a collapsed run mapping to its first character. The map is what lets
 * the browser's measured line division, which indexes the raw text, be re-expressed as offsets
 * into the laid-out run text.
 */
export function normalizeWhitespace(text: string, mode: Collapse): { text: string; src: number[] } {
  if (mode === "preserve") return { text, src: Array.from({ length: text.length }, (_, i) => i) };
  let out = "";
  const src: number[] = [];
  for (let i = 0; i < text.length; ) {
    if (!DOCUMENT_WHITESPACE.test(text[i]!)) {
      out += text[i];
      src.push(i);
      i++;
      continue;
    }
    let j = i;
    let breaks = 0;
    for (; j < text.length && DOCUMENT_WHITESPACE.test(text[j]!); j++) if (text[j] === "\n") breaks++;
    // `preserve-breaks` keeps every segment break and collapses the spaces around them.
    for (let k = 0; k < (mode === "preserve-breaks" && breaks > 0 ? breaks : 1); k++) {
      out += mode === "preserve-breaks" && breaks > 0 ? "\n" : " ";
      src.push(i);
    }
    i = j;
  }
  return { text: out, src };
}

export function decorationOf(s: Record<string, string>, color: Color): TextDecoration | undefined {
  const raw = s["-webkit-text-decorations-in-effect"] ?? s["text-decoration-line"] ?? "none";
  const lines = raw.split(/\s+/).filter((l): l is DecorationLine => l === "underline" || l === "line-through" || l === "overline");
  if (!lines.length) return undefined;
  const d: TextDecoration = { lines };
  const dc = parseColor(s["text-decoration-color"]);
  if (dc && (dc.r !== color.r || dc.g !== color.g || dc.b !== color.b || dc.a !== color.a)) d.color = dc;
  const st = s["text-decoration-style"];
  if (st === "double" || st === "dotted" || st === "dashed" || st === "wavy") d.style = st;
  return d;
}
