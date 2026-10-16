import { describe, expect, test } from "bun:test";
import { bandNames, DEFAULT_BAND_DEVICES, planBands } from "../../../src/analysis/bands.ts";
import type { LayoutCondition } from "../../../src/model/layout.ts";

const media = (...queries: string[]): LayoutCondition[] =>
  queries.map((query) => ({ kind: "media", query, matches: false }));
const phone = { width: 390, height: 844 };
const plan = (conditions: LayoutCondition[], first = phone, max = 1376) =>
  planBands(conditions, { first, devices: DEFAULT_BAND_DEVICES, max });
const noEdges = { edges: [], captures: [phone], extra: [], probes: [320], notes: [] };
const container = (query: string): LayoutCondition => ({ kind: "container", query, matches: false, container: "card" });

describe("planBands", () => {
  test("one min-width edge: phone band and the first device past it", () => {
    expect(plan(media("(min-width: 600px)"))).toEqual({
      edges: [{ px: 600, inclusive: true }],
      captures: [phone, { width: 834, height: 1210 }],
      extra: [],
      probes: [320, 1376],
      notes: [],
    });
  });

  test("Tailwind range syntax in rem", () => {
    const p = plan(media("(width >= 40rem)"));
    expect(p.edges).toEqual([{ px: 640, inclusive: true }]);
    expect(p.captures.map((c) => c.width)).toEqual([390, 834]);
  });

  test("a band without a device is captured at its lower bound with the first height", () => {
    expect(plan(media("(min-width: 640px)", "(min-width: 700px)")).captures).toEqual([
      phone,
      { width: 640, height: 844 },
      { width: 834, height: 1210 },
    ]);
  });

  test("max-width 767px and min-width 768px are one boundary", () => {
    const p = plan(media("(max-width: 767px)", "(min-width: 768px)"));
    expect(p.edges).toHaveLength(1);
    expect(p.captures.map((c) => c.width)).toEqual([390, 834]);
    expect(p.probes).toEqual([320, 1376]);
  });

  test("thresholds outside the band range are noted and dropped", () => {
    const p = plan(media("(min-width: 300px)", "(min-width: 1400px)"));
    expect(p.notes).toEqual([
      "@media (min-width: 300px): width threshold 300px is outside the 320–1376px band range; the view does not switch there",
      "@media (min-width: 1400px): width threshold 1400px is outside the 320–1376px band range; the view does not switch there",
    ]);
    expect({ ...p, notes: [] }).toEqual(noEdges);
  });

  test("more than six bands keeps the lowest five edges", () => {
    const p = plan(media(...[400, 500, 600, 700, 800, 900, 1000, 1100].map((w) => `(min-width: ${w}px)`)));
    expect(p.edges.map((e) => e.px)).toEqual([400, 500, 600, 700, 800]);
    expect(p.captures).toHaveLength(6);
    expect(p.notes).toEqual([
      "9 width bands exceed the 6-capture limit; thresholds from 900px up are not reconstructed",
    ]);
  });

  test("the configured viewport captures its own band", () => {
    expect(plan(media("(min-width: 600px)"), { width: 834, height: 1194 }).captures).toEqual([
      phone,
      { width: 834, height: 1194 },
    ]);
  });

  test("unattributed container and unparsed media conditions are ignored without a note", () => {
    const conditions: LayoutCondition[] = [
      { kind: "container", query: "(min-width: 400px)", matches: false },
      ...media("(orientation: landscape)"),
    ];
    expect(plan(conditions)).toEqual(noEdges);
  });

  test("container queries add captures at the top of each band, then at the bottom of each band past band 0", () => {
    const both = plan([...media("(min-width: 768px)"), container("(width >= 28rem)")]);
    // Band 1's lowest capture (its lower bound) represents it; its device moves to `extra`, the probe to the top.
    expect(both.captures).toEqual([phone, { width: 768, height: 1210 }]);
    expect(both.extra).toEqual([
      { width: 767, height: 844 },
      { width: 1376, height: 1210 },
      { width: 834, height: 1210 },
    ]);
    expect(both.probes).toEqual([320, 1376]);
    // A band captured at its lower bound needs no second capture there; `first`'s band keeps `first`.
    expect(plan([...media("(min-width: 834px)"), container("(width >= 28rem)")]).extra).toEqual([
      { width: 833, height: 844 },
      { width: 1376, height: 1210 },
    ]);
    const ipad = plan([...media("(min-width: 768px)"), container("(width >= 28rem)")], { width: 834, height: 1210 });
    expect(ipad.captures).toEqual([phone, { width: 834, height: 1210 }]);
    expect(ipad.extra).toEqual([
      { width: 767, height: 844 },
      { width: 1376, height: 1210 },
    ]);
    const only = plan([container("(width >= 28rem)")]);
    expect({ ...only, extra: [] }).toEqual(noEdges);
    expect(only.extra).toEqual([{ width: 1376, height: 844 }]);
    expect(plan(media("(min-width: 768px)")).extra).toEqual([]);
    const widths = (n: number) => [400, 500, 600, 700, 800].slice(0, n).map((w) => `(min-width: ${w}px)`);
    const five = plan([...media(...widths(5)), container("(width >= 28rem)")]);
    expect([five.captures.length, five.extra.length]).toEqual([6, 0]);
    const four = plan([...media(...widths(4)), container("(width >= 28rem)")]);
    expect(four.captures.length + four.extra.length).toBe(6);
    expect(four.extra).toEqual([{ width: 399, height: 844 }]);
    // Upper bounds first; the budget left goes to the lower bounds, lowest bands first.
    const three = plan(
      [...media("(min-width: 500px)", "(min-width: 900px)"), container("(width >= 28rem)")],
      phone,
      1210,
    );
    expect(three.captures.map((c) => c.width)).toEqual([390, 500, 1210]);
    expect(three.extra.map((c) => c.width)).toEqual([499, 899, 834]);
  });

  test("no conditions: today's probe rule", () => {
    expect(plan([])).toEqual(noEdges);
    expect(plan([], { width: 320, height: 844 }).probes).toEqual([390]);
  });
});

test("bandNames: Tailwind defaults for inclusive edges, else w<capture width>; band 0 unnamed", () => {
  expect(
    bandNames([
      { px: 768, inclusive: true },
      { px: 1024, inclusive: true },
    ]),
  ).toEqual(["", "md", "lg"]);
  expect(bandNames([{ px: 767, inclusive: false }])).toEqual(["", "w768"]);
  expect(bandNames([{ px: 600, inclusive: true }])).toEqual(["", "w600"]);
  expect(
    bandNames(
      [
        { px: 448, inclusive: true },
        { px: 600, inclusive: true },
      ],
      "cq_",
    ),
  ).toEqual(["", "cq_md", "cq_w600"]);
});
