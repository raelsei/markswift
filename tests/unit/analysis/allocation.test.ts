import { expect, test } from "bun:test";
import { flexAllocatedWidths, gridAllocatedWidths } from "../../../src/analysis/allocation.ts";
import { fractionGridTracks } from "../../../src/css/grid.ts";
import type { AllocationTrack } from "../../../src/model/allocation.ts";

const track = (basis: number, grow: number, shrink = 1, min = 0, max?: number, inset = 0): AllocationTrack =>
  ({ basis, grow, shrink, min, ...(max === undefined ? {} : { max }), inset });

test("flex adds weighted free space to bases and redistributes a capped share", () => {
  expect(flexAllocatedWidths(360, [track(40, 1, 1, 0, 70), track(80, 2), track(0, 1)]))
    .toEqual([70, 220, 70]);
});

test("shrink uses inner bases and refreezes minimum violations", () => {
  const sizes = flexAllocatedWidths(220, [track(120, 0, 1, 100, undefined, 20), track(100, 0, 2), track(80, 0)]);
  expect(sizes[0]).toBe(100);
  expect(sizes[1]).toBeCloseTo(100 - 60 * 200 / 280, 8);
  expect(sizes[2]).toBeCloseTo(80 - 60 * 80 / 280, 8);
});

test("fractional flex factor totals preserve unused free space", () => {
  expect(flexAllocatedWidths(300, [track(40, 0.25), track(60, 0.25)])).toEqual([90, 110]);
});

test("fr minimums freeze before remaining fractions are shared", () => {
  expect(gridAllocatedWidths(300, [track(80, 0, 0, 80, 80), track(0, 1, 0, 100), track(0, 2, 0)]))
    .toEqual([80, 100, 120]);
  expect(gridAllocatedWidths(300, [track(0, 0.2, 0), track(0, 0.3, 0)])).toEqual([60, 90]);
});

test("nested fixed-count repeat and minmax retain authored weights", () => {
  expect(fractionGridTracks("[first] 64px repeat(2, minmax(0px, 1fr) 2fr) [last]"))
    .toEqual([{ fixed: 64 }, { fraction: 1, minimum: 0 }, { fraction: 2 }, { fraction: 1, minimum: 0 }, { fraction: 2 }]);
});

test.each(["repeat(auto-fit,1fr)", "subgrid", "min-content 1fr", "25% 1fr", "minmax(auto,1fr)", "repeat(0,1fr)", "fit-content(100px) 1fr"])
  ("unproved track intent %s is rejected", value => expect(fractionGridTracks(value)).toBeUndefined());
