import { corpusFixtures } from "./corpus-fixtures.ts";
import { parseCorpusOptions, selectCorpus } from "./corpus-options.ts";
import { runCorpus } from "./corpus-runner.ts";

const options = parseCorpusOptions(process.argv.slice(2));
if (options.help) {
  console.log(`Usage: bun run test:corpus [options]
  --list                         List selected authored inputs; no Chrome/Xcode needed
  --split development|holdout|all Default: development; holdouts remain in the frozen manifest
  --categories a,b --cases a,b    Select known structural categories or exact cases
  --per-category N --limit N      Bound an exploratory run without claiming full acceptance
  --widths 320,390,500,768         App reuses one390 capture; fidelity uses each own capture
  --themes light,dark --modes app,fidelity
  --batch-size 4                  Compile shared native helpers once per batch
  --appearance-only               Diagnostic run without native geometry; cannot certify geometry
  --output out/goal/corpus        New immutable run directory for every invocation

Exit0: every selected required comparison passed; exit1: failed/incomplete evidence.
Default gates include actual native geometry with complete coverage at0.5 CSS px tolerance.
The full goal still requires independent interaction and acceptance gates.`);
} else {
  const fixtures = selectCorpus(corpusFixtures, options);
  if (options.list) console.log(JSON.stringify(fixtures.map(({ id, category, split, structureKey, challenge }) => ({ id, category, split, structureKey, challenge })), null, 2));
  else {
    const { run } = await runCorpus(fixtures, options);
    if (!run.allPassed || run.environment.sourceChangedDuringRun) process.exitCode = 1;
  }
}
