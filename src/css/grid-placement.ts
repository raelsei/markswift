export interface GridAxisPlacement { start?: number; span: number }
type GridLine = { line: number } | { span: number } | { auto: true };

function gridLine(value: string, explicitTracks?: number): GridLine | undefined {
  value = value.trim();
  if (value === "auto") return { auto: true };
  if (/^[+-]?\d+$/.test(value)) {
    const number = Number(value);
    if (number === 0 || Math.abs(number) > 257 || (number < 0 && explicitTracks === undefined)) return;
    const line = number < 0 ? explicitTracks! + 2 + number : number;
    return { line };
  }
  const span = /^(?:span\s+(\d+)|(\d+)\s+span)$/.exec(value);
  const count = Number(span?.[1] ?? span?.[2]);
  return count >= 1 && count <= 256 ? { span: count } : undefined;
}

/** Resolve numeric line/span intent, including the CSS line-conflict rules. */
export function gridAxisPlacement(startValue = "auto", endValue = "auto", explicitTracks?: number): GridAxisPlacement | undefined {
  const start = gridLine(startValue, explicitTracks);
  let end = gridLine(endValue, explicitTracks);
  if (!start || !end) return;
  if ("span" in start && "span" in end) end = { auto: true };
  if ("line" in start && "line" in end) {
    const first = Math.min(start.line, end.line), last = Math.max(start.line, end.line);
    return { start: first - 1, span: Math.max(1, last - first) };
  }
  if ("line" in start) return { start: start.line - 1, span: "span" in end ? end.span : 1 };
  if ("line" in end) {
    const span = "span" in start ? start.span : 1;
    return { start: end.line - span - 1, span };
  }
  return { span: "span" in start ? start.span : "span" in end ? end.span : 1 };
}
