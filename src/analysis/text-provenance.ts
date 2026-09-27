/** Ordered UTF16 claims follow text edits; inferred geometry never supplies source characters. */
import type { LayoutNode } from "../model/layout.ts";
import type { TextRunSource, TextProjectionUnit, SourceInterval } from "../model/text-source.ts";
import type { Collapse } from "./text-runs.ts";

export function textSourceProjection(node: LayoutNode, text: string, indices: number[], mode: Collapse): TextRunSource | undefined {
  const source = node.textSource;
  if (!source) return;
  const projection: TextRunSource = { version: 1, units: [], excluded: [], unavailable: [] };
  if (source.join !== "verified" || source.origin !== "dom") projection.unavailable.push("source occurrence join/origin unavailable");
  const mismatch = source.kind === "text" && source.raw !== node.text;
  if (mismatch) projection.unavailable.push("raw/layout text differ");
  if (!/^[\x09-\x0d\x20-\x7e]*$/.test(source.raw)) projection.unavailable.push("non-ASCII cluster mapping unavailable");
  let breakOrdinal = 0;
  for (let output = 0; output < text.length; output++) {
    const at = indices[output], interval = (start: number, end: number): SourceInterval => ({ occurrence: source.key, start, end });
    const unit: TextProjectionUnit = { output: [output, output + 1], sources: [], operation: "unknown" };
    if (source.kind !== "text") {
      unit.operation = "source-break";
      unit.sources = [interval(0, 0)];
      unit.boundary = { kind: source.kind, owner: source.key, ordinal: breakOrdinal++ };
      if (source.kind === "wbr") projection.unavailable.push("wbr native cluster scope unavailable");
    } else if (at === -1) {
      unit.operation = "synthetic"; unit.reason = "inferred separator without source ownership";
      projection.unavailable.push("inferred separator source unavailable");
    } else if (mismatch || at === undefined || at < 0 || at >= source.raw.length) {
      unit.reason = "source offset unavailable";
      projection.unavailable.push("source offset unavailable");
    } else if (mode !== "preserve" && /\s/.test(source.raw[at]!)) {
      let end = at + 1;
      while (end < source.raw.length && /\s/.test(source.raw[end]!)) end++;
      if (mode === "preserve-breaks" && source.raw.slice(at, end).includes("\n")) {
        unit.reason = "preserve-breaks collapse group mapping unproved";
        projection.unavailable.push(unit.reason);
      } else {
        unit.operation = "collapse"; unit.sources = [interval(at, end)];
        unit.group = `collapse:${source.key}:${at}:${end}`;
      }
    } else {
      unit.operation = "copy"; unit.sources = [interval(at, at + 1)];
      if (source.raw[at] === "\n") {
        unit.operation = "source-break";
        unit.boundary = { kind: "source-newline", owner: source.key, source: interval(at, at + 1), ordinal: breakOrdinal++ };
      }
    }
    projection.units.push(unit);
  }
  projection.unavailable = [...new Set(projection.unavailable)];
  return projection;
}

/** The removed intervals stay explicit; retained output ranges become local to the sliced run. */
export function trimTextSource(source: TextRunSource, start: number, end: number): TextRunSource {
  const units: TextProjectionUnit[] = [], excluded = [...source.excluded];
  for (const unit of source.units) {
    if (unit.output[0] >= start && unit.output[1] <= end) units.push({ ...unit, output: [unit.output[0] - start, unit.output[1] - start] });
    else excluded.push({ sources: unit.sources, operation: "trim", ...(unit.group ? { group: unit.group } : {}), reason: unit.reason ?? "run edge trim" });
  }
  return { ...source, units, excluded };
}

export function prependInferredSource(source: TextRunSource): TextRunSource {
  return { ...source,
    units: [{ output: [0, 1], sources: [], operation: "synthetic", reason: "inferred separator without source ownership" },
      ...source.units.map(unit => ({ ...unit, output: [unit.output[0] + 1, unit.output[1] + 1] as [number, number] }))],
    unavailable: [...new Set([...source.unavailable, "inferred separator source unavailable"])],
  };
}

export function omittedTextSource(node: LayoutNode): TextRunSource | undefined {
  if (!node.textSource) return;
  return { version: 1, units: [], excluded: [{ operation: "unknown", sources: [{ occurrence: node.textSource.key, start: 0, end: node.textSource.raw.length }],
    reason: "whitespace-only or empty run omitted before cross-occurrence collapse is independently proved" }],
    unavailable: ["cross-occurrence whitespace/empty occurrence accounting requires independent validation"] };
}
