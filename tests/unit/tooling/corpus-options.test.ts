import { expect, test } from "bun:test";
import { parseCorpusOptions, selectCorpus } from "../../../tools/verify/corpus-options.ts";
import type { CorpusFixture } from "../../../tools/verify/corpus-model.ts";

test("corpus default matrix includes source390 and keeps holdouts separate", () => {
  expect(parseCorpusOptions([])).toMatchObject({ widths: [320, 390, 500, 768], themes: ["light", "dark"], modes: ["app", "fidelity"], split: "development", batchSize: 4, geometry: true });
  expect(parseCorpusOptions(["--appearance-only"])).toMatchObject({ geometry: false });
  expect(parseCorpusOptions(["--modes", "fidelity", "--widths", "320"])).toMatchObject({ modes: ["fidelity"], widths: [320] });
});
test("empty, repeated and invalid matrix arguments cannot manufacture complete evidence", () => {
  for (const args of [["--widths", "320"], ["--widths", "390,390"], ["--themes", ""], ["--themes", "light,,dark"], ["--modes", "native"], ["--batch-size", "0"], ["--split", "passed"]]) {
    expect(() => parseCorpusOptions(args)).toThrow();
  }
});
test("selection is predetermined by category and split, never by score", () => {
  const fixtures = [
    { id: "a", category: "text", split: "development" }, { id: "b", category: "text", split: "holdout" },
    { id: "c", category: "grid", split: "development" }, { id: "d", category: "grid", split: "development" },
  ] as CorpusFixture[];
  expect(selectCorpus(fixtures, parseCorpusOptions(["--per-category", "1"])).map(fixture => fixture.id)).toEqual(["a", "c"]);
  expect(selectCorpus(fixtures, parseCorpusOptions(["--split", "holdout"])).map(fixture => fixture.id)).toEqual(["b"]);
  expect(() => selectCorpus(fixtures, parseCorpusOptions(["--cases", "missing"]))).toThrow("Unknown");
  expect(() => selectCorpus(fixtures, parseCorpusOptions(["--categories", "missing"]))).toThrow("Unknown");
});
