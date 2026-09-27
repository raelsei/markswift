import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CorpusFixture } from "./corpus-model.ts";
import type { AppearanceSummary } from "./corpus-artifacts.ts";
import { corpusThresholds } from "./corpus-metrics.ts";
import { sourceDigest, sourceDigestPolicy } from "./corpus-source.ts";
import { readSourceSnapshot, verifySourceSnapshot } from "./corpus-snapshot.ts";
import { verifyCorpusGeometry, type CorpusGeometryEvidence } from "./corpus-geometry.ts";
import { verifyNativeRenderEvidence } from "./native-evidence.ts";
export { sourceDigest } from "./corpus-source.ts";

export interface CorpusComparison {
  fixture: string; category: string; split: CorpusFixture["split"];
  theme: "light" | "dark"; mode: "app" | "fidelity"; width: number;
  status: "passed" | "appearance-failed" | "geometry-failed" | "capture-failed" | "compile-render-failed";
  reference?: string; native?: string;
  /** Current-width browser reference. App source may intentionally be one different width. */
  layoutHash?: string; sourceLayoutHash?: string; swiftHash?: string;
  artifactHashes?: Record<string, string>;
  diagnostics?: unknown; warnings?: string[]; appearance?: AppearanceSummary; error?: string;
  geometry?: CorpusGeometryEvidence;
}
export interface CorpusRun {
  version: 1; runID: string; startedAt: string; completedAt?: string;
  revision: string; dirtyHash: string; sourceHash: string; environment: Record<string, string>;
  fixtureHash: string; fixtures: Array<{
    id: string; category: string; split: string; structureKey: string; sourceHash: string;
    expectations: Pick<CorpusFixture, "regions" | "features" | "rootSelector" | "height" | "hosted" | "responsive" | "background">;
    challenge?: string;
  }>;
  widths: number[]; themes: Array<"light" | "dark">; modes: Array<"app" | "fidelity">;
  thresholds: typeof corpusThresholds; comparisons: CorpusComparison[];
  /** Old appearance-only exploratory runs omit this field and never certify geometry. */
  geometryRequired?: boolean;
  /** Copied older diagnostic runs omit this and cannot establish executed native acceptance. */
  nativeExecutionRequired?: boolean;
  expected: number; complete: boolean; allPassed: boolean;
  integrityValid: boolean; integrityFailures: string[];
  bundleArtifacts: Record<string, Record<string, string>>;
  /** Appearance is one gate; this field cannot claim the full goal without interaction/geometry evidence. */
  goalComplete: false;
}

const command = promisify(execFile);
export const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

export async function createCorpusRun(fixtures: readonly CorpusFixture[], widths: number[], themes: CorpusRun["themes"],
  modes: CorpusRun["modes"], cwd: string): Promise<CorpusRun> {
  const [revision, diff, bun, node, xcode, chrome, simulators] = await Promise.all([
    readCommand("git", ["rev-parse", "HEAD"], cwd), readCommand("git", ["diff", "HEAD", "--", "src", "tools", "tests", "package.json", "tsconfig.json"], cwd),
    readCommand("bun", ["--version"], cwd), readCommand("node", ["--version"], cwd), readCommand("xcodebuild", ["-version"], cwd),
    readCommand("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--version"], cwd),
    readCommand("xcrun", ["simctl", "list", "devices", "booted", "-j"], cwd),
  ]);
  const manifest = fixtures.map(fixture => ({
    id: fixture.id, category: fixture.category, split: fixture.split, structureKey: fixture.structureKey,
    sourceHash: digest(fixture.html + "\n" + fixture.css), ...(fixture.challenge ? { challenge: fixture.challenge } : {}),
    expectations: { regions: fixture.regions, features: fixture.features, rootSelector: fixture.rootSelector,
      height: fixture.height, hosted: fixture.hosted, responsive: fixture.responsive, background: fixture.background },
  }));
  const startedAt = new Date().toISOString(), sourceHash = await sourceDigest(cwd);
  const frozen = await readSourceSnapshot(cwd);
  if (frozen) await verifySourceSnapshot(cwd);
  return {
    version: 1, runID: startedAt.replaceAll(/[:.]/g, "-") + "-" + digest(JSON.stringify(manifest)).slice(0, 10), startedAt,
    revision: frozen?.revision ?? revision, dirtyHash: frozen?.dirtyHash ?? digest(diff), sourceHash,
    environment: { bun, node, xcode, chrome, simulators,
      platform: `${process.platform}/${process.arch}`, sourceDigestPolicy,
      ...(frozen ? { sourceSnapshot: cwd, sourceSnapshotHash: digest(JSON.stringify(frozen)), dependencyHash: frozen.dependencyHash } : {}) },
    fixtureHash: digest(JSON.stringify(manifest)), fixtures: manifest, widths, themes, modes,
    thresholds: corpusThresholds, comparisons: [], expected: fixtures.length * widths.length * themes.length * modes.length,
    complete: false, allPassed: false, goalComplete: false, integrityValid: true, integrityFailures: [], bundleArtifacts: {},
  };
}

/** Runs never reuse an output directory; each checkpoint uses an exclusive immutable filename. */
export async function saveCorpusCheckpoint(run: CorpusRun, directory: string, final = false): Promise<void> {
  await mkdir(directory, { recursive: true });
  const keys = run.comparisons.map(item => `${item.fixture}/${item.theme}/${item.mode}/${item.width}`);
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate corpus comparison");
  const expectedKeys = new Set(run.fixtures.flatMap(fixture => run.themes.flatMap(theme => run.modes.flatMap(mode =>
    run.widths.map(width => `${fixture.id}/${theme}/${mode}/${width}`)))));
  if (expectedKeys.size !== run.expected || keys.some(key => !expectedKeys.has(key))) throw new Error("Corpus matrix contains unexpected or duplicate inputs");
  run.complete = run.comparisons.length === run.expected;
  if (final) await checkCorpusIntegrity(run);
  run.allPassed = run.complete && run.integrityValid && run.comparisons.every(item => item.status === "passed");
  if (final) run.completedAt = new Date().toISOString();
  const name = final ? "final.json" : `checkpoint-${String(run.comparisons.length).padStart(6, "0")}.json`;
  await writeFile(join(directory, name), JSON.stringify(run, null, 2) + "\n", { flag: "wx" });
}
/** Re-read actual stored artifacts before certifying a run; hashes are not just annotations. */
export async function checkCorpusIntegrity(run: CorpusRun): Promise<void> {
  const failures = new Set(run.integrityFailures);
  if (run.environment.sourceChangedDuringRun) failures.add("Source changed during run");
  if (run.environment.sourceSnapshot) {
    try {
      const frozen = await verifySourceSnapshot(run.environment.sourceSnapshot);
      if (digest(JSON.stringify(frozen)) !== run.environment.sourceSnapshotHash || frozen.sourceHash !== run.sourceHash ||
        frozen.dependencyHash !== run.environment.dependencyHash) failures.add("Frozen execution metadata changed");
    } catch (error) { failures.add(`Frozen execution invalid: ${error instanceof Error ? error.message : error}`); }
  }
  const artifacts = new Map<string, string>();
  const add = (path: string, hash: string) => {
    if (artifacts.has(path) && artifacts.get(path) !== hash) failures.add(`Conflicting artifact hash: ${path}`);
    artifacts.set(path, hash);
  };
  for (const comparison of run.comparisons) {
    if (comparison.status !== "passed" && comparison.status !== "appearance-failed" && comparison.status !== "geometry-failed") continue;
    for (const path of [comparison.reference, comparison.native]) {
      if (!path || !comparison.artifactHashes?.[path]) failures.add(`Missing image hash: ${comparison.fixture}/${comparison.mode}/${comparison.width}`);
    }
    for (const [path, hash] of Object.entries(comparison.artifactHashes ?? {})) add(path, hash);
    if (run.geometryRequired) {
      const label = `${comparison.fixture}/${comparison.mode}/${comparison.width}`;
      if (!comparison.geometry) failures.add(`Missing actual geometry evidence: ${label}`);
      else {
        for (const path of [comparison.geometry.manifest, comparison.geometry.native, comparison.geometry.reference, comparison.geometry.report]) {
          if (!comparison.artifactHashes?.[path]) failures.add(`Missing geometry hash: ${label}`);
        }
        try {
          const fixture = run.fixtures.find(fixture => fixture.id === comparison.fixture);
          if (!fixture) throw new Error("Geometry fixture missing from frozen manifest");
          await verifyCorpusGeometry(comparison.geometry, { width: comparison.width, height: fixture.expectations.height, mode: comparison.mode });
        }
        catch (error) { failures.add(`Invalid geometry evidence: ${label}: ${error instanceof Error ? error.message : error}`); }
        if (comparison.status === "passed" && !comparison.geometry.passed) failures.add(`Failed geometry claimed as passed: ${label}`);
      }
    }
    if (!comparison.swiftHash || !run.bundleArtifacts[comparison.swiftHash]) failures.add(`Missing bundle hashes: ${comparison.fixture}/${comparison.mode}`);
  }
  for (const files of Object.values(run.bundleArtifacts)) for (const [path, hash] of Object.entries(files)) add(path, hash);
  if (run.nativeExecutionRequired) {
    for (const [swiftHash, files] of Object.entries(run.bundleArtifacts)) {
      const outputs: Record<string, string> = {};
      for (const comparison of run.comparisons.filter(item => item.swiftHash === swiftHash)) {
        for (const path of [comparison.native, comparison.geometry?.native]) {
          if (path && comparison.artifactHashes?.[path]) outputs[path] = comparison.artifactHashes[path]!;
        }
      }
      try { await verifyNativeRenderEvidence(files, outputs); }
      catch (error) { failures.add(`Invalid native execution evidence: ${swiftHash}: ${error instanceof Error ? error.message : error}`); }
    }
  }
  await Promise.all([...artifacts].map(async ([path, hash]) => {
    try { if (digest(await readFile(path)) !== hash) failures.add(`Artifact changed: ${path}`); }
    catch { failures.add(`Artifact missing: ${path}`); }
  }));
  run.integrityFailures = [...failures].sort();
  run.integrityValid = run.integrityFailures.length === 0;
}
async function readCommand(file: string, args: string[], cwd: string): Promise<string> {
  try { const result = await command(file, args, { cwd, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 }); return result.stdout.trim(); }
  catch (error) { return `unavailable: ${error instanceof Error ? error.message : error}`; }
}
