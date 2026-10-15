import { expect, test } from "bun:test";
import { fontStretch, variationSettings } from "../../../src/css/index.ts";

test("variationSettings reads Chrome's sorted, quoted serialisation", () => {
  expect(variationSettings("normal")).toEqual({});
  expect(variationSettings('"GRAD" -20, "wght" 650')).toEqual({ GRAD: -20, wght: 650 });
  expect(variationSettings('"wdth" 87.5')).toEqual({ wdth: 87.5 });
});

test("fontStretch is the computed percentage, 100 otherwise", () => {
  expect(fontStretch("75%")).toBe(75);
  expect(fontStretch(undefined)).toBe(100);
  expect(fontStretch("normal")).toBe(100);
});
