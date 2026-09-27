import { expect, test } from "bun:test";
import { textSourceProjection, trimTextSource } from "../../../src/analysis/text-provenance.ts";
import { normalizeWhitespace } from "../../../src/analysis/text-runs.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

function node(raw: string, tag = "#text"): LayoutNode {
  return { tag, attrs: {}, styles: {}, text: raw, bounds: { x: 0, y: 0, w: 100, h: 20 }, children: [],
    textSource: { key: "dom:/0", kind: tag === "br" ? "br" : tag === "wbr" ? "wbr" : "text", raw, ancestors: [], origin: "dom", join: "verified", layoutPresent: true } };
}

test("collapsed source intervals retain the complete raw UTF16 whitespace group", () => {
  const raw = "A \t\n B", normalized = normalizeWhitespace(raw, "collapse");
  const projection = textSourceProjection(node(raw), normalized.text, normalized.src, "collapse")!;
  expect(normalized.text).toBe("A B");
  expect(projection.units.map(unit => [unit.output, unit.operation, unit.sources])).toEqual([
    [[0, 1], "copy", [{ occurrence: "dom:/0", start: 0, end: 1 }]],
    [[1, 2], "collapse", [{ occurrence: "dom:/0", start: 1, end: 5 }]],
    [[2, 3], "copy", [{ occurrence: "dom:/0", start: 5, end: 6 }]],
  ]);
});

test("UTF16 preserved offsets retain surrogate units but explicitly decline native cluster mapping", () => {
  const raw = "A😀B", normalized = normalizeWhitespace(raw, "preserve");
  expect(normalized.src).toEqual([0, 1, 2, 3]);
  const projection = textSourceProjection(node(raw), normalized.text, normalized.src, "preserve")!;
  expect(projection.units.map(unit => unit.sources[0]!.start)).toEqual([0, 1, 2, 3]);
  expect(projection.unavailable.join(" ")).toContain("non-ASCII cluster mapping");
});

test("trim classifies removed source intervals and reindexes output without losing lineage", () => {
  const raw = "  Words  ", normalized = normalizeWhitespace(raw, "collapse");
  const projection = textSourceProjection(node(raw), normalized.text, normalized.src, "collapse")!;
  const trimmed = trimTextSource(projection, 1, normalized.text.length - 1);
  expect(trimmed.units.map(unit => unit.output)).toEqual([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  expect(trimmed.excluded.map(unit => unit.sources)).toEqual([
    [{ occurrence: "dom:/0", start: 0, end: 2 }], [{ occurrence: "dom:/0", start: 7, end: 9 }],
  ]);
});

test("inferred minus-one spaces and join/raw mismatches never acquire convenient source characters", () => {
  const projection = textSourceProjection(node("Words"), " Words", [-1, 0, 1, 2, 3, 4], "collapse")!;
  expect(projection.units[0]).toMatchObject({ operation: "synthetic", sources: [] });
  expect(projection.unavailable.join(" ")).toContain("inferred separator");
  const mismatch = node("Raw"); mismatch.text = "Used";
  expect(textSourceProjection(mismatch, "Used", [0, 1, 2, 3], "collapse")!.unavailable.join(" ")).toContain("raw/layout text differ");
});

test("br and raw newline boundaries retain distinct original owners", () => {
  const br = textSourceProjection(node("", "br"), "\n", [0], "preserve")!;
  expect(br.units[0]).toMatchObject({ operation: "source-break", boundary: { kind: "br", owner: "dom:/0", ordinal: 0 } });
  const raw = "A\nB", normalized = normalizeWhitespace(raw, "preserve");
  const newline = textSourceProjection(node(raw), normalized.text, normalized.src, "preserve")!;
  expect(newline.units[1]!.boundary).toMatchObject({ kind: "source-newline", owner: "dom:/0", source: { start: 1, end: 2 } });
});
