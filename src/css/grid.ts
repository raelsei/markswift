/** Browser-resolved grid tracks; authored repeat/fr/subgrid values remain unresolved. */
export function resolvedGridTracks(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const tokens = value.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/);
  const tracks: number[] = [];
  for (const token of tokens) {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(token)) return undefined;
    const size = Number(token.slice(0, -2));
    if (!Number.isFinite(size)) return undefined;
    tracks.push(size);
  }
  return tracks.length ? tracks : undefined;
}

export type FractionGridTrack = { fixed: number } | { fraction: number; minimum?: number };

/** Preserve Typed OM track intent; never recover fractions from used pixel widths. */
export function fractionGridTracks(value: string | undefined): FractionGridTrack[] | undefined {
  if (!value) return undefined;
  const tokens = trackTokens(value.replace(/\[[^\]]*\]/g, " "));
  if (!tokens) return undefined;
  const tracks: FractionGridTrack[] = [];
  for (const token of tokens) {
    const repeated = /^repeat\(\s*(\d+)\s*,\s*(.*)\)$/s.exec(token);
    if (repeated) {
      const count = Number(repeated[1]), inner = fractionGridTracks(repeated[2]);
      if (count < 1 || count > 256 || !inner || inner.length * count + tracks.length > 256) return undefined;
      for (let i = 0; i < count; i++) tracks.push(...inner);
      continue;
    }
    const fixed = /^(\d+(?:\.\d*)?|\.\d+)(?:px)?$/.exec(token);
    if (fixed && (token.endsWith("px") || Number(fixed[1]) === 0)) { tracks.push({ fixed: Number(fixed[1]) }); continue; }
    const fraction = /^(\d+(?:\.\d*)?|\.\d+)fr$/.exec(token);
    if (fraction && Number(fraction[1]) > 0) { tracks.push({ fraction: Number(fraction[1]) }); continue; }
    const minmax = /^minmax\(\s*(\d+(?:\.\d*)?|\.\d+)(px)?\s*,\s*(\d+(?:\.\d*)?|\.\d+)fr\s*\)$/.exec(token);
    if (minmax && (minmax[2] || Number(minmax[1]) === 0) && Number(minmax[3]) > 0) {
      tracks.push({ fraction: Number(minmax[3]), minimum: Number(minmax[1]) }); continue;
    }
    return undefined;
  }
  return tracks.length ? tracks : undefined;
}

/** Definite pixel rows or content-driven auto rows; no intrinsic or relative track guesses. */
export function gridRowTracks(value: string | undefined): Array<number | null> | undefined {
  if (value === "none") return [];
  if (!value) return undefined;
  const tokens = trackTokens(value.replace(/\[[^\]]*\]/g, " "));
  if (!tokens) return undefined;
  const rows: Array<number | null> = [];
  for (const token of tokens) {
    if (token === "auto") { rows.push(null); continue; }
    const repeat = /^repeat\(\s*(\d+)\s*,\s*(.*)\)$/s.exec(token);
    if (repeat) {
      const count = Number(repeat[1]), inner = gridRowTracks(repeat[2]);
      if (count < 1 || count > 256 || !inner?.length || inner.length * count + rows.length > 256) return;
      for (let i = 0; i < count; i++) rows.push(...inner);
      continue;
    }
    const px = /^(\d+(?:\.\d*)?|\.\d+)(px)?$/.exec(token);
    if (!px || (!px[2] && Number(px[1]) !== 0)) return;
    rows.push(Number(px[1]));
  }
  return rows.length && rows.length <= 256 ? rows : undefined;
}

function trackTokens(value: string): string[] | undefined {
  let depth = 0, token = "";
  const tokens: string[] = [];
  for (const ch of value.trim()) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return undefined;
    if (/\s/.test(ch) && depth === 0) { if (token) tokens.push(token); token = ""; }
    else token += ch;
  }
  if (depth !== 0) return undefined;
  if (token) tokens.push(token);
  return tokens;
}
