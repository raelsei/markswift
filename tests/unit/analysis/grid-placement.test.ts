import { expect, test } from "bun:test";
import type { LayoutNode } from "../../../src/model/layout.ts";
import { gridAxisPlacement } from "../../../src/css/grid-placement.ts";
import { gridPlacements } from "../../../src/analysis/grid-placement.ts";
import { gridRowTracks } from "../../../src/css/grid.ts";
const item = (columnStart = "auto", columnEnd = "auto", rowStart = "auto", rowEnd = "auto", order = "0"): LayoutNode => ({
  tag: "div", attrs: {}, children: [], bounds: { x: 0, y: 0, w: 0, h: 0 },
  styles: { "grid-column-start": columnStart, "grid-column-end": columnEnd, "grid-row-start": rowStart, "grid-row-end": rowEnd, order },
});
test("numeric lines and spans resolve without measured geometry", () => {
  expect(gridAxisPlacement("1", "span 2", 3)).toEqual({ start: 0, span: 2 });
  expect(gridAxisPlacement("span 2", "-1", 3)).toEqual({ start: 1, span: 2 });
  expect(gridAxisPlacement("4", "2", 3)).toEqual({ start: 1, span: 2 });
  expect(gridAxisPlacement("2", "2", 3)).toEqual({ start: 1, span: 1 });
  expect(gridAxisPlacement("span 2", "span 3", 3)).toEqual({ span: 2 });
  expect(gridAxisPlacement("named", "auto", 3)).toBeUndefined();
});
test("explicit occupancy, column spans and sparse cursor retain holes in source order", () => {
  expect(gridPlacements([item("3", "auto", "1"), item("span 2"), item("span 2"), item("1", "auto", "4"), item("3"), item("2")], 3).placements)
    .toEqual([{ row: 0, column: 2, columnSpan: 1 }, { row: 0, column: 0, columnSpan: 2 },
      { row: 1, column: 0, columnSpan: 2 }, { row: 3, column: 0, columnSpan: 1 },
      { row: 1, column: 2, columnSpan: 1 }, { row: 2, column: 1, columnSpan: 1 }]);
});
test("row-locked items precede auto placement while CSS order changes positions only", () => {
  expect(gridPlacements([item(), item("span 2", "auto", "1"), item("auto", "auto", "auto", "auto", "-1")], 3).placements)
    .toEqual([{ row: 1, column: 0, columnSpan: 1 }, { row: 0, column: 0, columnSpan: 2 }, { row: 0, column: 2, columnSpan: 1 }]);
});
test("unsupported placement contracts remain specific", () => {
  expect(gridPlacements([item("1", "auto", "1", "span 2")], 3).reason).toContain("row spans");
  expect(gridPlacements([item("3", "span 2")], 3).reason).toContain("implicit");
  expect(gridPlacements([item("1", "auto", "1"), item("1", "auto", "1")], 3).reason).toContain("overlapping");
  expect(gridPlacements([item()], 3, "row dense").reason).toContain("dense");
});

test("mixed pixel and automatic rows retain declared empty rows and repeat patterns", () => {
  expect(gridRowTracks("[head] 40px auto repeat(2, 0 auto 72px) [tail]")).toEqual([40, null, 0, null, 72, 0, null, 72]);
  expect(gridRowTracks("none")).toEqual([]);
  for (const value of ["min-content", "1fr", "30%", "minmax(0,1fr)", "repeat(auto-fill,40px)"]) expect(gridRowTracks(value)).toBeUndefined();
  expect(gridPlacements([item("1", "auto", "-1")], 3, "row", 3).rows).toBe(4);
});
