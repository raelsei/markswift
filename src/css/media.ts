/** Media and container conditions as band edges: thresholds a breakpoint capture plans bands from. */
import type { BandEdge } from "../model/semantic.ts";

/** A pure dimension condition: `above` = lower limit, `below` = upper limit. */
export interface WidthQuery {
  above?: BandEdge;
  below?: BandEdge;
}

export interface MediaQueryCondition {
  width?: WidthQuery;
  height?: WidthQuery;
  orientation?: "portrait" | "landscape";
}

const WIDTH: Record<string, true> = { width: true, "inline-size": true };
const HEIGHT: Record<string, true> = { height: true, "block-size": true };
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

/** Chrome's `conditionText` as a parsed media condition (width, height, orientation). */
export function mediaCondition(query: string): MediaQueryCondition | undefined {
  const q = query
    .toLowerCase()
    .trim()
    .replace(/^only\s+/, "")
    .replace(/^(screen|all)\s+and\s+/, "");
  if (!q.startsWith("(") || /,|\bor\b|\bnot\b/.test(q)) return undefined;
  const out: MediaQueryCondition = {};
  const parseLimit = (target: WidthQuery, op: string, raw: string, feature?: "width" | "height"): boolean => {
    const px = length(raw);
    const r = RANGE[op];
    if (px === undefined || !r) return false;
    const edge: BandEdge = { px, inclusive: r.inclusive, ...(feature && feature !== "width" ? { feature } : {}) };
    if (r.side === "above") {
      if (!target.above || px > target.above.px || (px === target.above.px && !edge.inclusive)) target.above = edge;
    } else if (!target.below || px < target.below.px || (px === target.below.px && edge.inclusive)) target.below = edge;
    return true;
  };
  for (const part of q.split(/\s+and\s+/)) {
    const inner = /^\((.*)\)$/.exec(part)?.[1]?.trim();
    if (inner === undefined) return undefined;
    const orient = /^orientation\s*:\s*(portrait|landscape)$/.exec(inner);
    if (orient) {
      out.orientation = orient[1] as "portrait" | "landscape";
      continue;
    }
    const colon = /^(min-|max-)?([a-z-]+)\s*:\s*(.+)$/.exec(inner);
    if (colon) {
      const prop = colon[2]!;
      const isW = WIDTH[prop];
      const isH = HEIGHT[prop];
      if (!isW && !isH) return undefined;
      const target = isW ? (out.width ??= {}) : (out.height ??= {});
      const feat = isW ? "width" : "height";
      const ok =
        colon[1] === "min-"
          ? parseLimit(target, ">=", colon[3]!, feat)
          : colon[1] === "max-"
            ? parseLimit(target, "<=", colon[3]!, feat)
            : parseLimit(target, ">=", colon[3]!, feat) && parseLimit(target, "<=", colon[3]!, feat);
      if (!ok) return undefined;
      continue;
    }
    const t = inner.split(/\s*(<=|>=|<|>)\s*/);
    if (t.length === 3 && WIDTH[t[0]!]) {
      if (!parseLimit((out.width ??= {}), t[1]!, t[2]!, "width")) return undefined;
    } else if (t.length === 3 && WIDTH[t[2]!]) {
      if (!parseLimit((out.width ??= {}), FLIP[t[1]!]!, t[0]!, "width")) return undefined;
    } else if (t.length === 5 && WIDTH[t[2]!]) {
      if (
        !parseLimit((out.width ??= {}), FLIP[t[1]!]!, t[0]!, "width") ||
        !parseLimit(out.width, t[3]!, t[4]!, "width")
      )
        return undefined;
    } else if (t.length === 3 && HEIGHT[t[0]!]) {
      if (!parseLimit((out.height ??= {}), t[1]!, t[2]!, "height")) return undefined;
    } else if (t.length === 3 && HEIGHT[t[2]!]) {
      if (!parseLimit((out.height ??= {}), FLIP[t[1]!]!, t[0]!, "height")) return undefined;
    } else if (t.length === 5 && HEIGHT[t[2]!]) {
      if (
        !parseLimit((out.height ??= {}), FLIP[t[1]!]!, t[0]!, "height") ||
        !parseLimit(out.height, t[3]!, t[4]!, "height")
      )
        return undefined;
    } else return undefined;
  }
  return out.width || out.height || out.orientation ? out : undefined;
}

/** Chrome's `conditionText` as a pure width condition; `undefined` when it is not one this parser reconstructs. */
export function widthQuery(query: string): WidthQuery | undefined {
  const cond = mediaCondition(query);
  return cond?.height || cond?.orientation ? undefined : cond?.width;
}

/** Chrome's `conditionText` as a pure height condition. */
export function heightQuery(query: string): WidthQuery | undefined {
  const cond = mediaCondition(query);
  return cond?.width || cond?.orientation ? undefined : cond?.height;
}

/** Chrome's `conditionText` as a pure orientation condition (`portrait` | `landscape`). */
export function orientationQuery(query: string): "portrait" | "landscape" | undefined {
  const cond = mediaCondition(query);
  return cond?.width || cond?.height ? undefined : cond?.orientation;
}
/** `width` and optional `height` are past `edge`. */
export function passes(edge: BandEdge, width: number, height = 0): boolean {
  if (edge.feature === "height") return edge.inclusive ? height >= edge.px : height > edge.px;
  if (edge.feature === "orientation") return edge.orientation === "landscape" ? width > height : height >= width;
  return edge.inclusive ? width >= edge.px : width > edge.px;
}
export function matchesWidth(q: WidthQuery, width: number): boolean {
  return (!q.above || passes(q.above, width)) && (!q.below || !passes(q.below, width));
}

/** First integer width past the edge. */
export function captureWidth(edge: BandEdge): number {
  return edge.inclusive ? Math.ceil(edge.px) : Math.floor(edge.px) + 1;
}

/** Band index of `width` (and optional `height`): the number of (ascending) edges it passes. */
export function bandOf(width: number, edges: BandEdge[], height = 0): number {
  return edges.filter((e) => passes(e, width, height)).length;
}

export function matchesMedia(q: MediaQueryCondition, width: number, height: number): boolean {
  if (q.width && !matchesWidth(q.width, width)) return false;
  if (q.height && !matchesWidth(q.height, height)) return false;
  if (q.orientation === "landscape" && !(width > height)) return false;
  if (q.orientation === "portrait" && !(height >= width)) return false;
  return true;
}
