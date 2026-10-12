import { expect, test } from "bun:test";
import { parseTrackTemplate } from "../../../src/css/index.ts";
import type { GridTemplate } from "../../../src/model/semantic.ts";

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
  ["minmax(100px, 1fr) 2fr", undefined],
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
