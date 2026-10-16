import { expect, test } from "bun:test";
import { type GridArea, gridSpan, parseGridAreas, parseRowTracks, parseTrackTemplate } from "../../../src/css/index.ts";
import type { GridRowTrack, GridTemplate } from "../../../src/model/semantic.ts";

const px = (n: number) => ({ kind: "px", px: n }) as const;
const fr = (n: number) => ({ kind: "fr", fr: n }) as const;
const auto = { kind: "auto" } as const;

test.each<[string | undefined, GridTemplate | undefined]>([
  ["1fr 2fr", { tracks: [fr(1), fr(2)] }],
  ["repeat(3, minmax(0px, 1fr))", { tracks: [fr(1), fr(1), fr(1)] }],
  ["repeat(2, minmax(0, 1.5fr))", { tracks: [fr(1.5), fr(1.5)] }],
  ["16px 1fr", { tracks: [px(16), fr(1)] }],
  ["repeat(auto-fit, minmax(160px, 1fr))", { tracks: [], autoRepeat: { mode: "fit", min: 160 } }],
  ["repeat(auto-fill, minmax(100px, 1fr))", { tracks: [], autoRepeat: { mode: "fill", min: 100 } }],
  ["auto 1fr auto", { tracks: [auto, fr(1), auto] }],
  ["[a] 100px [b] 1fr", { tracks: [px(100), fr(1)] }],
  ["repeat(2, 100px 1fr)", { tracks: [px(100), fr(1), px(100), fr(1)] }],
  ["120px 120px", { tracks: [px(120), px(120)] }],
  ["fit-content(200px) 1fr", undefined],
  ["50% 1fr", undefined],
  ["calc(25% - 4px) 1fr", undefined],
  ["minmax(100px, 1fr) 2fr", { tracks: [{ kind: "fr", fr: 1, min: 100 }, fr(2)] }],
  ["repeat(2, minmax(120.5px, 1fr))", { tracks: Array(2).fill({ kind: "fr", fr: 1, min: 120.5 }) }],
  ["minmax(10%, 1fr) 1fr", undefined],
  ["minmax(100px, 200px) 1fr", undefined],
  ["minmax(auto, 1fr) 1fr", undefined],
  ["repeat(auto-fill, 100px)", undefined],
  ["repeat(auto-fit, minmax(160px, 1fr)) 100px", undefined],
  ["repeat(auto-fill, minmax(100px, 2fr))", undefined],
  ["repeat(2, repeat(2, 1fr))", undefined],
  ["min-content 1fr", undefined],
  ["max-content 1fr", undefined],
  ["subgrid", undefined],
  ["masonry", undefined],
  ["none", undefined],
  ["", undefined],
  [undefined, undefined],
])("parseTrackTemplate(%p)", (value, expected) => {
  expect(parseTrackTemplate(value)).toEqual(expected);
});

const rowPx = (n: number): GridRowTrack => ({ kind: "px", px: n });
const rowAuto: GridRowTrack = { kind: "auto" };

test.each<[string | undefined, GridRowTrack[] | undefined]>([
  ["repeat(2, 20px) auto", [rowPx(20), rowPx(20), rowAuto]],
  ["min-content", [rowAuto]],
  ["auto auto", [rowAuto, rowAuto]],
  ["30px", [rowPx(30)]],
  ["minmax(10px, auto)", undefined],
  ["50%", undefined],
  ["1fr", undefined],
  ["fit-content(20px)", undefined],
  ["", undefined],
  [undefined, undefined],
])("parseRowTracks(%p)", (value, expected) => {
  expect(parseRowTracks(value)).toEqual(expected);
});

test("parseGridAreas resolves named areas", () => {
  expect(parseGridAreas('"x x ." "y . z"')).toEqual({
    areas: {
      x: { colStart: 1, colEnd: 3, rowStart: 1, rowEnd: 2 },
      y: { colStart: 1, colEnd: 2, rowStart: 2, rowEnd: 3 },
      z: { colStart: 3, colEnd: 4, rowStart: 2, rowEnd: 3 },
    },
    rows: 2,
    columns: 3,
  });
  expect(parseGridAreas("none")).toEqual({ areas: {}, rows: 0, columns: 0 });
});

const A: Record<string, GridArea> = parseGridAreas('"x x ." "y . z"')!.areas;
test.each<
  [
    string | undefined,
    string | undefined,
    Record<string, GridArea>,
    "col" | "row",
    number,
    { start?: number; span: number } | undefined,
  ]
>([
  ["1", "-1", {}, "col", 4, { start: 1, span: 3 }],
  ["span 2", "3", {}, "row", 1, { start: 1, span: 2 }],
  ["x", "x", A, "col", 4, { start: 1, span: 2 }],
  ["x-start", "x-end", A, "col", 4, { start: 1, span: 2 }],
  ["3", "1", {}, "col", 4, { start: 1, span: 2 }],
  ["span 2", "span 2", {}, "row", 1, { span: 2 }],
  [undefined, undefined, {}, "col", 4, { span: 1 }],
  ["2", "auto", {}, "col", 4, { start: 2, span: 1 }],
  ["auto", "3", {}, "col", 4, { start: 2, span: 1 }],
  ["a", "c", A, "col", 4, undefined],
  ["span x", "auto", A, "col", 4, undefined],
  ["2 a", "auto", A, "col", 4, undefined],
  ["span 3", "2", {}, "col", 4, undefined],
  ["0", "auto", {}, "col", 4, undefined],
])("gridSpan(%p, %p, …, %p, %p)", (start, end, areas, axis, lines, expected) => {
  expect(gridSpan(start, end, areas, axis, lines)).toEqual(expected);
});
