import type { GridTemplate, GridTrack } from "../model/semantic.ts";
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
