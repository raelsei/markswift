import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { CorpusFixture } from "./corpus-model.ts";
import type { CorpusRunOptions } from "./corpus-runner.ts";

export interface CorpusOptions extends CorpusRunOptions {
  help: boolean; list: boolean; split: "all" | "development" | "holdout";
  categories?: string[]; cases?: string[]; limit?: number; perCategory?: number;
}
export function parseCorpusOptions(args: string[]): CorpusOptions {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    help: { type: "boolean" }, list: { type: "boolean" }, split: { type: "string", default: "development" },
    cases: { type: "string" }, categories: { type: "string" }, limit: { type: "string" }, "per-category": { type: "string" },
    widths: { type: "string", default: "320,390,500,768" }, themes: { type: "string", default: "light,dark" },
    modes: { type: "string", default: "app,fidelity" }, output: { type: "string", default: "out/goal/corpus" },
    "batch-size": { type: "string", default: "4" },
    "appearance-only": { type: "boolean", default: false },
  } });
  const split = values.split;
  if (split !== "all" && split !== "development" && split !== "holdout") throw new Error("split must be all, development or holdout");
  const widths = list(values.widths!, "widths").map(value => integer(value, "width", 240, 1920));
  const themes = list(values.themes!, "themes"), modes = list(values.modes!, "modes");
  if (themes.some(value => value !== "light" && value !== "dark")) throw new Error("themes must be light/dark");
  if (modes.some(value => value !== "app" && value !== "fidelity")) throw new Error("modes must be app/fidelity");
  if (modes.includes("app") && !widths.includes(390)) throw new Error("app comparison requires390 in widths for its single source capture");
  return {
    help: !!values.help, list: !!values.list, split, widths,
    themes: themes as CorpusRunOptions["themes"], modes: modes as CorpusRunOptions["modes"], outputRoot: resolve(values.output!),
    batchSize: integer(values["batch-size"]!, "batch-size", 1, 16),
    geometry: !values["appearance-only"],
    ...(values.cases ? { cases: list(values.cases, "cases") } : {}),
    ...(values.categories ? { categories: list(values.categories, "categories") } : {}),
    ...(values.limit ? { limit: integer(values.limit, "limit", 1, 10000) } : {}),
    ...(values["per-category"] ? { perCategory: integer(values["per-category"], "per-category", 1, 1000) } : {}),
  };
}
export function selectCorpus(fixtures: readonly CorpusFixture[], options: CorpusOptions): CorpusFixture[] {
  for (const id of options.cases ?? []) if (!fixtures.some(fixture => fixture.id === id)) throw new Error(`Unknown corpus case: ${id}`);
  for (const category of options.categories ?? []) if (!fixtures.some(fixture => fixture.category === category)) throw new Error(`Unknown corpus category: ${category}`);
  const counts = new Map<string, number>();
  let selected = fixtures.filter(fixture => {
    if (options.split !== "all" && fixture.split !== options.split) return false;
    if (options.cases && !options.cases.includes(fixture.id) || options.categories && !options.categories.includes(fixture.category)) return false;
    const count = counts.get(fixture.category) ?? 0;
    if (options.perCategory !== undefined && count >= options.perCategory) return false;
    counts.set(fixture.category, count + 1); return true;
  });
  if (options.limit !== undefined) selected = selected.slice(0, options.limit);
  if (!selected.length) throw new Error("No corpus cases selected");
  return selected;
}
function list(value: string, label: string): string[] {
  const values = value.split(",").map(item => item.trim());
  if (values.some(item => !item) || new Set(values).size !== values.length) throw new Error(`${label} must be a nonempty unique comma-separated list`);
  return values;
}
function integer(value: string, label: string, min: number, max: number): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`${label} must be an integer ${min}–${max}`);
  return Number(value);
}
