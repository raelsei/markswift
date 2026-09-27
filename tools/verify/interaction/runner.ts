import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sourceDigest } from "../corpus-evidence.ts";
import { interactionResults } from "./results.ts";
import { interactionScheme } from "./xcode-project.ts";
import type { InteractionManifest } from "./types.ts";
import { verifySourceSnapshot } from "../corpus-snapshot.ts";
import { interactionArtifactHashes, verifyInteractionSources } from "./integrity.ts";
export { verifyInteractionSources } from "./integrity.ts";

/** The coordinator explicitly supplies a simulator; this path must be scheduled apart from visual runs. */
export async function executeInteractions(directory: string, simulator: string): Promise<InteractionManifest> {
  if (!/^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/.test(simulator)) throw new Error("Execution requires an explicit simulator UDID");
  const manifest = JSON.parse(await readFile(join(directory, "prepared.json"), "utf8")) as InteractionManifest;
  if (manifest.version !== 1 || manifest.status !== "prepared" || !manifest.plans.length) throw new Error("Invalid prepared interaction manifest");
  if (await Bun.file(join(directory, "executed.json")).exists()) throw new Error("Interaction evidence is immutable; prepare a fresh run to execute again");
  await verifyInteractionSources(directory, manifest);
  const cwd = join(import.meta.dir, "../../.."), currentSource = await sourceDigest(cwd);
  if (manifest.sourceSnapshot) {
    if (resolve(manifest.sourceSnapshot.directory) !== resolve(cwd)) throw new Error("Execute interactions using the frozen snapshot's copied entry point");
    const snapshot = await verifySourceSnapshot(cwd);
    if (snapshot.sourceHash !== manifest.sourceSnapshot.sourceHash || snapshot.dependencyHash !== manifest.sourceSnapshot.dependencyHash) throw new Error("Prepared source snapshot provenance changed");
  }
  if (manifest.preparationSourceChanged || currentSource !== manifest.sourceHash) throw new Error("Compiler or harness source changed after preparation; prepare a fresh interaction project");
  if (!manifest.plans.some(plan => plan.transitionCount > 0)) throw new Error("This project contains no stateful gesture scenario");
  const resultBundle = join(directory, "Interactions.xcresult"), startedAt = new Date().toISOString();
  const run = await command([
    "xcodebuild", "test", "-project", join(directory, "CorpusInteractions.xcodeproj"), "-scheme", interactionScheme,
    "-destination", `platform=iOS Simulator,id=${simulator}`, "-derivedDataPath", join(directory, "DerivedData"),
    "-resultBundlePath", resultBundle, "-parallel-testing-enabled", "NO", "-maximum-concurrent-test-simulator-destinations", "1",
    "-test-timeouts-enabled", "YES", "-default-test-execution-time-allowance", "180", "-maximum-test-execution-time-allowance", "240",
    "-collect-test-diagnostics", "never",
    "CODE_SIGNING_ALLOWED=NO", "-quiet",
  ], directory, 15 * 60_000);
  await writeFile(join(directory, "xcodebuild.log"), run.output, { flag: "wx" });
  let report: unknown = {};
  const extracted = await command(["xcrun", "xcresulttool", "get", "test-results", "tests", "--schema-version", "0.4.0", "--path", resultBundle], directory, 30_000);
  await writeFile(join(directory, "xcresult-tests.json"), extracted.output, { flag: "wx" });
  if (extracted.exitCode === 0) {
    try { report = JSON.parse(extracted.output); } catch { /* Malformed reports cannot count as executed tests. */ }
  }
  manifest.results = interactionResults(manifest.plans, report);
  manifest.status = "executed";
  const after = await sourceDigest(cwd);
  manifest.execution = { startedAt, completedAt: new Date().toISOString(), simulator, exitCode: run.exitCode, resultBundle,
    ...(after !== manifest.sourceHash ? { sourceChanged: after } : {}) };
  if (manifest.sourceSnapshot) {
    try { await verifySourceSnapshot(cwd); }
    catch (error) { manifest.execution.snapshotChanged = error instanceof Error ? error.message : String(error); }
  }
  try { await verifyInteractionSources(directory, manifest); }
  catch (error) { manifest.execution.generatedChanged = error instanceof Error ? error.message : String(error); }
  manifest.execution.artifactHashes = await interactionArtifactHashes(directory, resultBundle);
  manifest.passedStatefulFamilies = after === manifest.sourceHash && run.exitCode === 0 && !manifest.execution.snapshotChanged && !manifest.execution.generatedChanged
    ? manifest.results.filter(result => result.status === "passed" && manifest.plans.find(plan => plan.fixture === result.fixture)!.transitionCount > 0).length : 0;
  await writeFile(join(directory, "executed.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return manifest;
}

async function command(args: string[], cwd: string, timeout: number): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { exitCode: timedOut ? 124 : exitCode, output: stdout + stderr + (timedOut ? "\nNative interaction command timed out\n" : "") };
  } finally { clearTimeout(timer); }
}
