import { expect, test } from "bun:test";
import { filterModifier } from "../../../src/swift/effects.ts";
import type { SemNode } from "../../../src/model/semantic.ts";

test("brightness() emits contrast then additive brightness, which multiplies like CSS", () => {
  const node = { id: "n", diagnostics: [] } as unknown as SemNode;
  // (c − ½)·x + ½ + (x − 1)/2 = c·x
  expect(filterModifier({ kind: "brightness", amount: 1.4 }, node, { mode: "app" })).toEqual([
    ".contrast(1.4)",
    ".brightness(0.2)",
  ]);
  expect(filterModifier({ kind: "brightness", amount: 0.6 }, node, { mode: "app" })).toEqual([
    ".contrast(0.6)",
    ".brightness(-0.2)",
  ]);
});
