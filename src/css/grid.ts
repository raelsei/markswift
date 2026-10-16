import type { GridRowTrack, GridTemplate, GridTrack } from "../model/semantic.ts";
import { splitTop } from "./syntax.ts";

const NUM = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`;
const PX = new RegExp(`^(${NUM})px$`);
const FR = new RegExp(`^(${NUM})fr$`);
const MINMAX_FR = new RegExp(`^minmax\\((?:(${NUM})px|0),\\s*(${NUM})fr\\)$`);
const AUTO_REPEAT = new RegExp(`^repeat\\(auto-(fill|fit),\\s*minmax\\((${NUM})px,\\s*1fr\\)\\)$`);
const REPEAT = /^repeat\((\d+),(.*)\)$/s;

/** Browser-resolved grid tracks; authored repeat/fr/subgrid values remain unresolved. */
export function resolvedGridTracks(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const tokens = value
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/);
  const tracks: number[] = [];
  for (const token of tokens) {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(token)) return undefined;
    const size = Number(token.slice(0, -2));
    if (!Number.isFinite(size)) return undefined;
    tracks.push(size);
  }
  return tracks.length ? tracks : undefined;
}

function track(token: string): GridTrack | undefined {
  if (token === "auto") return { kind: "auto" };
  const px = PX.exec(token);
  if (px) return { kind: "px", px: Number(px[1]) };
  const fr = FR.exec(token);
  if (fr) return { kind: "fr", fr: Number(fr[1]) };
  const mm = MINMAX_FR.exec(token);
  if (!mm) return undefined;
  const min = Number(mm[1] ?? 0);
  return min > 0 ? { kind: "fr", fr: Number(mm[2]), min } : { kind: "fr", fr: Number(mm[2]) };
}

/** Authored Typed-OM template → tracks; undefined for anything MarkswiftTracks cannot reproduce. */
export function parseTrackTemplate(value: string | undefined): GridTemplate | undefined {
  if (!value) return undefined;
  const tokens = splitTop(value.replace(/\[[^\]]*\]/g, " ").trim(), " ");
  const auto = tokens.length === 1 ? AUTO_REPEAT.exec(tokens[0]!) : null;
  if (auto) return { tracks: [], autoRepeat: { mode: auto[1] as "fill" | "fit", min: Number(auto[2]) } };
  const tracks: GridTrack[] = [];
  for (const token of tokens) {
    const repeat = REPEAT.exec(token);
    const count = repeat ? Number(repeat[1]) : 1;
    const inner = repeat ? splitTop(repeat[2]!.trim(), " ") : [token];
    if (count < 1 || !inner.length) return undefined;
    const parsed = inner.map(track);
    if (parsed.some((t) => !t)) return undefined;
    for (let i = 0; i < count; i++) tracks.push(...(parsed as GridTrack[]));
  }
  return tracks.length ? { tracks } : undefined;
}

const CONTENT_ROW: Record<string, true> = { auto: true, "min-content": true, "max-content": true };

/** Authored `grid-template-rows` / computed `grid-auto-rows` → rows MarkswiftTracks sizes; undefined otherwise. */
export function parseRowTracks(value: string | undefined): GridRowTrack[] | undefined {
  if (!value) return undefined;
  const rows: GridRowTrack[] = [];
  for (const token of splitTop(value.trim(), " ")) {
    const repeat = REPEAT.exec(token);
    const count = repeat ? Number(repeat[1]) : 1;
    const inner = repeat ? splitTop(repeat[2]!.trim(), " ") : [token];
    if (count < 1 || !inner.length) return undefined;
    const parsed = inner.map((t): GridRowTrack | undefined => {
      if (CONTENT_ROW[t]) return { kind: "auto" };
      const px = PX.exec(t);
      return px ? { kind: "px", px: Number(px[1]) } : undefined;
    });
    if (parsed.some((t) => !t)) return undefined;
    for (let i = 0; i < count; i++) rows.push(...(parsed as GridRowTrack[]));
  }
  return rows.length ? rows : undefined;
}

export interface GridArea {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
}

/** Computed `grid-template-areas` → each named area's 1-based lines and the areas' row/column counts; `none` → empty. */
export function parseGridAreas(
  value: string | undefined,
): { areas: Record<string, GridArea>; rows: number; columns: number } | undefined {
  if (!value || value === "none") return { areas: {}, rows: 0, columns: 0 };
  const rows = [...value.matchAll(/"([^"]*)"/g)].map((m) => m[1]!.trim().split(/\s+/));
  if (!rows.length) return undefined;
  const areas: Record<string, GridArea> = {};
  for (const [r, cells] of rows.entries())
    for (const [c, name] of cells.entries()) {
      if (/^\.+$/.test(name)) continue;
      const a = (areas[name] ??= { colStart: c + 1, colEnd: c + 2, rowStart: r + 1, rowEnd: r + 2 });
      a.colEnd = Math.max(a.colEnd, c + 2);
      a.rowEnd = Math.max(a.rowEnd, r + 2);
    }
  return { areas, rows: rows.length, columns: rows[0]!.length };
}

/**
 * CSS grid §8.3 for one axis: computed start/end longhands → 1-based start line (absent = auto-placed) and span.
 * `lines` = the explicit grid's line count on this axis (negative lines count back from it). Area names (also
 * `<area>-start`/`<area>-end`) resolve through `areas`. Undefined for what MarkswiftTracks cannot place: named lines
 * of the template, `span <name>`, `<n> <name>`, or a line before the grid's first.
 */
export function gridSpan(
  start: string | undefined,
  end: string | undefined,
  areas: Record<string, GridArea>,
  axis: "col" | "row",
  lines: number,
): { start?: number; span: number } | undefined {
  type Line = { line: number } | { span: number } | "auto";
  const parse = (v: string, edge: "Start" | "End"): Line | undefined => {
    if (v === "auto") return "auto";
    const n = /^(-?\d+)$/.exec(v);
    if (n)
      return Number(n[1]) > 0
        ? { line: Number(n[1]) }
        : Number(n[1]) < 0
          ? { line: lines + 1 + Number(n[1]) }
          : undefined;
    const span = /^span (\d+)$/.exec(v);
    if (span) return { span: Number(span[1]) };
    const named = /^(.+?)(?:-(start|end))?$/.exec(v)!;
    const area = areas[named[1]!];
    if (!area) return undefined;
    const side = named[2] === "start" ? "Start" : named[2] === "end" ? "End" : edge;
    return { line: area[`${axis}${side}`] };
  };
  const s = parse(start ?? "auto", "Start");
  const e = parse(end ?? "auto", "End");
  if (
    !s ||
    !e ||
    (typeof s === "object" && "line" in s && s.line < 1) ||
    (typeof e === "object" && "line" in e && e.line < 1)
  )
    return undefined;
  if (typeof s === "object" && "line" in s) {
    if (typeof e === "object" && "line" in e)
      return s.line === e.line
        ? { start: s.line, span: 1 }
        : { start: Math.min(s.line, e.line), span: Math.abs(e.line - s.line) };
    return { start: s.line, span: typeof e === "object" ? e.span : 1 };
  }
  if (typeof e === "object" && "line" in e) {
    const span = typeof s === "object" ? s.span : 1;
    return e.line - span >= 1 ? { start: e.line - span, span } : undefined;
  }
  return { span: typeof s === "object" ? s.span : typeof e === "object" ? e.span : 1 };
}
