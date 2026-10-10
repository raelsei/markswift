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
