/** Width `@media`/`@container` conditions as band edges: the thresholds a breakpoint capture plans bands from. */
import type { BandEdge } from "../model/semantic.ts";

/** A pure width condition: `above` = lower limit (width must pass it), `below` = upper limit (width must not). */
export interface WidthQuery {
  above?: BandEdge;
  below?: BandEdge;
}

const WIDTH: Record<string, true> = { width: true, "inline-size": true };
/** `width OP L` → which limit and whether the edge px itself is past it. */
const RANGE: Record<string, { side: "above" | "below"; inclusive: boolean }> = {
  ">=": { side: "above", inclusive: true },
  ">": { side: "above", inclusive: false },
  "<=": { side: "below", inclusive: false },
  "<": { side: "below", inclusive: true },
};
/** `L OP width` ≡ `width FLIP[OP] L`. */
const FLIP: Record<string, string> = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };
const UNIT: Record<string, number> = { px: 1, em: 16, rem: 16 };

// ponytail: em/rem are 16px (the media-query initial font size), container queries too, where CSS resolves rem against
// the root font size; read the root `font-size` if a design changes it.
function length(s: string): number | undefined {
  if (s === "0") return 0;
  const m = /^(\d*\.?\d+)(px|em|rem)$/.exec(s);
  return m ? Number(m[1]) * UNIT[m[2]!]! : undefined;
}

/** Chrome's `conditionText` as a width condition; `undefined` when it is not one this parser reconstructs. */
export function widthQuery(query: string): WidthQuery | undefined {
  const q = query
    .toLowerCase()
    .trim()
    .replace(/^only\s+/, "")
    .replace(/^(screen|all)\s+and\s+/, "");
  if (!q.startsWith("(") || /,|\bor\b|\bnot\b/.test(q)) return undefined;
  const out: WidthQuery = {};
  const limit = (op: string, raw: string): boolean => {
    const px = length(raw);
    const r = RANGE[op];
    if (px === undefined || !r) return false;
    const edge = { px, inclusive: r.inclusive };
    if (r.side === "above") {
      if (!out.above || px > out.above.px || (px === out.above.px && !edge.inclusive)) out.above = edge;
    } else if (!out.below || px < out.below.px || (px === out.below.px && edge.inclusive)) out.below = edge;
    return true;
  };
  for (const part of q.split(/\s+and\s+/)) {
    const inner = /^\((.*)\)$/.exec(part)?.[1]?.trim();
    if (inner === undefined) return undefined;
    const colon = /^(min-|max-)?([a-z-]+)\s*:\s*(.+)$/.exec(inner);
    if (colon) {
      if (!WIDTH[colon[2]!]) return undefined;
      const ok =
        colon[1] === "min-"
          ? limit(">=", colon[3]!)
          : colon[1] === "max-"
            ? limit("<=", colon[3]!)
            : limit(">=", colon[3]!) && limit("<=", colon[3]!);
      if (!ok) return undefined;
      continue;
    }
    const t = inner.split(/\s*(<=|>=|<|>)\s*/);
    if (t.length === 3 && WIDTH[t[0]!]) {
      if (!limit(t[1]!, t[2]!)) return undefined;
    } else if (t.length === 3 && WIDTH[t[2]!]) {
      if (!limit(FLIP[t[1]!]!, t[0]!)) return undefined;
    } else if (t.length === 5 && WIDTH[t[2]!]) {
      if (!limit(FLIP[t[1]!]!, t[0]!) || !limit(t[3]!, t[4]!)) return undefined;
    } else return undefined;
  }
  return out.above || out.below ? out : undefined;
}

/** `width` is past `edge`: `inclusive ? w >= px : w > px`. */
export function passes(edge: BandEdge, width: number): boolean {
  return edge.inclusive ? width >= edge.px : width > edge.px;
}

export function matchesWidth(q: WidthQuery, width: number): boolean {
  return (!q.above || passes(q.above, width)) && (!q.below || !passes(q.below, width));
}

/** First integer width past the edge. */
export function captureWidth(edge: BandEdge): number {
  return edge.inclusive ? Math.ceil(edge.px) : Math.floor(edge.px) + 1;
}

/** Band index of `width`: the number of (ascending) edges it passes. */
export function bandOf(width: number, edges: BandEdge[]): number {
  return edges.filter((e) => passes(e, width)).length;
}
