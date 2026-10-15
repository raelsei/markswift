import { describe, expect, test } from "bun:test";
import { bandOf, captureWidth, matchesWidth, passes, widthQuery } from "../../../src/css/index.ts";

const above = (px: number, inclusive: boolean) => ({ above: { px, inclusive } });
const below = (px: number, inclusive: boolean) => ({ below: { px, inclusive } });

describe("widthQuery", () => {
  test.each([
    ["(min-width: 640px)", above(640, true)],
    ["(min-width: 40rem)", above(640, true)],
    ["(min-width: 48em)", above(768, true)],
    ["(max-width: 767px)", below(767, false)],
    ["(width >= 40rem)", above(640, true)],
    ["(width > 600px)", above(600, false)],
    ["(width < 1024px)", below(1024, true)],
    ["(width <= 600px)", below(600, false)],
    ["(640px <= width < 1024px)", { ...above(640, true), ...below(1024, true) }],
    ["(1024px > width >= 640px)", { ...above(640, true), ...below(1024, true) }],
    ["(600px < width)", above(600, false)],
    ["(600px >= width)", below(600, false)],
    ["screen and (min-width: 768px)", above(768, true)],
    ["only screen and (min-width: 768px) and (max-width: 1023px)", { ...above(768, true), ...below(1023, false) }],
    ["(min-width: 600px) and (min-width: 700px)", above(700, true)],
    ["(max-width: 900px) and (max-width: 800px)", below(800, false)],
    ["(inline-size >= 28rem)", above(448, true)],
    ["(min-inline-size: 300px)", above(300, true)],
    ["(min-width: 600.5px)", above(600.5, true)],
    ["(min-width: 0)", above(0, true)],
    ["(min-width: 600px) and (orientation: landscape)", undefined],
    ["(orientation: portrait)", undefined],
    ["(min-height: 500px)", undefined],
    ["(min-aspect-ratio: 1/1)", undefined],
    ["not all and (min-width: 600px)", undefined],
    ["(min-width: 600px), print", undefined],
    ["(min-width: 600px) or (max-width: 300px)", undefined],
    ["print and (min-width: 600px)", undefined],
    ["(min-width: calc(600px + 1rem))", undefined],
    ["(prefers-color-scheme: dark)", undefined],
    ["screen", undefined],
    ["(min-width: 600vw)", undefined],
    ["(width = 600px)", undefined],
  ])("%s", (query, expected) => {
    expect(widthQuery(query)).toEqual(expected);
  });
});

describe("edge helpers", () => {
  test("passes and matchesWidth", () => {
    expect(passes({ px: 600, inclusive: true }, 600)).toBe(true);
    expect(passes({ px: 600, inclusive: false }, 600)).toBe(false);
    const q = widthQuery("(640px <= width < 1024px)")!;
    expect([639, 640, 1023, 1024].map((w) => matchesWidth(q, w))).toEqual([false, true, true, false]);
    expect(matchesWidth(widthQuery("(max-width: 767px)")!, 767)).toBe(true);
    expect(matchesWidth(widthQuery("(max-width: 767px)")!, 767.5)).toBe(false);
  });

  test("captureWidth is the first integer width past the edge", () => {
    expect(captureWidth({ px: 767, inclusive: false })).toBe(768);
    expect(captureWidth({ px: 640, inclusive: true })).toBe(640);
    expect(captureWidth({ px: 600.5, inclusive: true })).toBe(601);
  });

  test("bandOf counts passed edges", () => {
    expect(bandOf(599, [{ px: 600, inclusive: true }])).toBe(0);
    expect(bandOf(600, [{ px: 600, inclusive: true }])).toBe(1);
    expect(bandOf(767, [{ px: 767, inclusive: false }])).toBe(0);
    expect(bandOf(767.5, [{ px: 767, inclusive: false }])).toBe(1);
    expect(
      bandOf(900, [
        { px: 600, inclusive: true },
        { px: 1024, inclusive: true },
      ]),
    ).toBe(1);
  });
});
