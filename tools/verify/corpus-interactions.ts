import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { corpusFixtures } from "./corpus-fixtures.ts";
import { prepareInteractions } from "./interaction/prepare.ts";
import { executeInteractions } from "./interaction/runner.ts";
import { pilotInteractionFixtures } from "./interaction/types.ts";

/** Preparation is safe to run during a visual matrix. Execution requires coordinator scheduling. */
export async function corpusInteractions(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    help: { type: "boolean" }, cases: { type: "string" }, output: { type: "string", default: "out/goal/interactions" },
    width: { type: "string", default: "390" }, theme: { type: "string", default: "light" },
    execute: { type: "string" }, simulator: { type: "string" },
  } });
  if (values.help) {
    console.log(`Prepare real native UI tests for eight frozen development stateful corpus fixtures:
  bun tools/verify/corpus-interactions.ts [--cases id,id] [--width 390] [--theme light] [--output directory]
Execute a prepared project only when its simulator is free:
  bun tools/verify/corpus-interactions.ts --execute prepared-directory --simulator UDID
Prepared projects and compiler/helper transition tests are not native interaction evidence.`);
    return;
  }
  if (values.execute) {
    if (!values.simulator) throw new Error("--execute requires --simulator UDID");
    if (values.cases) throw new Error("Execution uses the prepared cases; --cases belongs to preparation");
    const manifest = await executeInteractions(resolve(values.execute), values.simulator);
    console.log(`Native UI results: ${manifest.results.filter(item => item.status === "passed").length}/${manifest.results.length} passed; ${manifest.passedStatefulFamilies} distinct stateful fixtures countable`);
    if (manifest.results.some(item => item.status !== "passed") || manifest.execution?.exitCode !== 0 || manifest.execution.sourceChanged || manifest.execution.snapshotChanged || manifest.execution.generatedChanged) process.exitCode = 1;
    return;
  }
  if (values.simulator) throw new Error("--simulator is only used with --execute");
  const ids = values.cases ? values.cases.split(",").map(value => value.trim()) : [...pilotInteractionFixtures];
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error("Cases must be nonempty and unique");
  const fixtures = ids.map(id => {
    const fixture = corpusFixtures.find(item => item.id === id);
    if (!fixture) throw new Error(`Unknown frozen corpus fixture: ${id}`);
    return fixture;
  });
  if (!/^\d+$/.test(values.width!)) throw new Error("Width must be an integer");
  if (values.theme !== "light" && values.theme !== "dark") throw new Error("Theme must be light or dark");
  const directory = await prepareInteractions(fixtures, { outputRoot: resolve(values.output!), width: Number(values.width), theme: values.theme });
  console.log(`Prepared ${fixtures.length} native UI fixture plans: ${directory}\nExecuted native interactions: 0; simulator execution must be scheduled separately.`);
}
if (import.meta.main) await corpusInteractions(process.argv.slice(2));
