import { join, resolve } from "node:path";
import { prepareGeometryProof, runGeometryProof } from "./geometry-proof.ts";
import { RELATIVE_GEOMETRY_FIXTURE, ALLOCATED_MARGIN_FIXTURE, HANGING_RELATIVE_FIXTURE } from "./relative-height-fixture.ts";

// The shared proof verifies immutable source/dependency bytes, true native anchors,
// independent target-width Chrome borders, complete coverage and observer pixel neutrality.
if (import.meta.main) {
  const work = resolve(process.argv[2] ?? "out/goal/relative-height-proof");
  const prepared = process.argv.includes("--prepare");
  const results = [];
  for (const [name, fixture] of [["relative", RELATIVE_GEOMETRY_FIXTURE], ["margin", ALLOCATED_MARGIN_FIXTURE], ["hanging", HANGING_RELATIVE_FIXTURE]] as const) {
    if (prepared) {
      const proof = await prepareGeometryProof(join(work, name), true, fixture);
      results.push({ name, widths: proof.widths, manifest: proof.observed.geometry });
    } else {
      const result = await runGeometryProof(join(work, name), true, fixture);
      results.push({ name, result });
      if (result.results.some(row => !row.pass)) process.exitCode = 1;
    }
  }
  console.log(JSON.stringify(results, null, 2));
}
