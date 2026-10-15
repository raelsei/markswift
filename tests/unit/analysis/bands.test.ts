import { describe, expect, test } from "bun:test";
import { DEFAULT_BAND_DEVICES, planBands } from "../../../src/analysis/bands.ts";
import type { LayoutCondition } from "../../../src/model/layout.ts";

const media = (...queries: string[]): LayoutCondition[] =>
  queries.map((query) => ({ kind: "media", query, matches: false }));
const phone = { width: 390, height: 844 };
const plan = (conditions: LayoutCondition[], first = phone, max = 1376) =>
  planBands(conditions, { first, devices: DEFAULT_BAND_DEVICES, max });
const noEdges = { edges: [], captures: [phone], probes: [320], notes: [] };

describe("planBands", () => {
  test("one min-width edge: phone band and the first device past it", () => {
    expect(plan(media("(min-width: 600px)"))).toEqual({
      edges: [{ px: 600, inclusive: true }],
      captures: [phone, { width: 834, height: 1210 }],
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

  test("container and unparsed media conditions are ignored without a note", () => {
    const conditions: LayoutCondition[] = [
      { kind: "container", query: "(min-width: 400px)", matches: false, container: "card" },
      ...media("(orientation: landscape)"),
    ];
    expect(plan(conditions)).toEqual(noEdges);
  });

  test("no conditions: today's probe rule", () => {
    expect(plan([])).toEqual(noEdges);
    expect(plan([], { width: 320, height: 844 }).probes).toEqual([390]);
  });
});
