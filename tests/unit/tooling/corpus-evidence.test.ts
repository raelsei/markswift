import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkCorpusIntegrity, digest, saveCorpusCheckpoint, sourceDigest, type CorpusRun } from "../../../tools/verify/corpus-evidence.ts";
import { corpusThresholds } from "../../../tools/verify/corpus-metrics.ts";

function run(): CorpusRun {
  return {
    version: 1, runID: "test", startedAt: "2026-09-27T00:00:00Z", revision: "revision", dirtyHash: "dirty", sourceHash: "source",
    environment: {}, fixtureHash: "fixtures", fixtures: [{ id: "a", category: "category", split: "development", structureKey: "a",
      sourceHash: "htmlcss", expectations: { regions: [], features: [], rootSelector: "#corpus", height: 300, hosted: false,
        responsive: true, background: { light: [255,255,255], dark: [0,0,0] } } }],
    widths: [390], themes: ["light"], modes: ["app"], thresholds: corpusThresholds, comparisons: [],
    expected: 1, complete: false, allPassed: false, goalComplete: false, integrityValid: true, integrityFailures: [], bundleArtifacts: {},
  };
}
const identity = { fixture: "a", category: "category", split: "development" as const, theme: "light" as const, mode: "app" as const, width: 390 };

test("a complete passed matrix requires unchanged hashed images and actual bundle artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-corpus-evidence-"));
  try {
    const image = join(directory, "image.png"), swift = join(directory, "View.swift");
    await writeFile(image, "image bytes"); await writeFile(swift, "swift bytes");
    const evidence = run();
    evidence.comparisons.push({ ...identity, status: "passed", reference: image, native: image, swiftHash: "bundle", artifactHashes: { [image]: digest("image bytes") } });
    evidence.bundleArtifacts.bundle = { [swift]: digest("swift bytes") };
    await saveCorpusCheckpoint(evidence, directory, true);
    expect(evidence.complete).toBe(true); expect(evidence.allPassed).toBe(true); expect(evidence.goalComplete).toBe(false);
    await expect(saveCorpusCheckpoint(evidence, directory, true)).rejects.toThrow();
    await writeFile(image, "changed bytes"); await checkCorpusIntegrity(evidence);
    expect(evidence.integrityValid).toBe(false);
    expect(evidence.integrityFailures).toContain(`Artifact changed: ${image}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unhashed appearance results and changed source never certify success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-corpus-invalid-"));
  try {
    const evidence = run(); evidence.environment.sourceChangedDuringRun = "new source";
    evidence.comparisons.push({ ...identity, status: "passed" });
    await saveCorpusCheckpoint(evidence, directory, true);
    expect(evidence.complete).toBe(true); expect(evidence.allPassed).toBe(false);
    expect(evidence.integrityFailures).toContain("Source changed during run");
    expect(evidence.integrityFailures.some(failure => failure.startsWith("Missing image hash"))).toBe(true);
    expect(evidence.integrityFailures.some(failure => failure.startsWith("Missing bundle hashes"))).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("appearance passes cannot certify a run that requires missing native geometry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-corpus-no-geometry-"));
  try {
    const image = join(directory, "image.png"), swift = join(directory, "View.swift");
    await writeFile(image, "image"); await writeFile(swift, "swift");
    const evidence = run(); evidence.geometryRequired = true;
    evidence.comparisons.push({ ...identity, status: "passed", reference: image, native: image,
      swiftHash: "bundle", artifactHashes: { [image]: digest("image") } });
    evidence.bundleArtifacts.bundle = { [swift]: digest("swift") };
    await saveCorpusCheckpoint(evidence, directory, true);
    expect(evidence.complete).toBe(true); expect(evidence.allPassed).toBe(false);
    expect(evidence.integrityFailures).toContain("Missing actual geometry evidence: a/app/390");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a saved image and Swift file cannot certify a run without the executed native test receipt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-corpus-no-execution-"));
  try {
    const image = join(directory, "image.png"), swift = join(directory, "View.swift");
    await writeFile(image, "image"); await writeFile(swift, "swift");
    const evidence = run(); evidence.nativeExecutionRequired = true;
    evidence.comparisons.push({ ...identity, status: "passed", reference: image, native: image,
      swiftHash: "bundle", artifactHashes: { [image]: digest("image") } });
    evidence.bundleArtifacts.bundle = { [swift]: digest("swift") };
    await saveCorpusCheckpoint(evidence, directory, true);
    expect(evidence.complete).toBe(true); expect(evidence.allPassed).toBe(false);
    expect(evidence.integrityFailures).toContain("Invalid native execution evidence: bundle: Native execution receipt is missing or ambiguous");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("duplicate or unexpected matrix cells are rejected instead of counted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-corpus-matrix-"));
  try {
    const evidence = run(); evidence.comparisons.push({ ...identity, status: "capture-failed" }, { ...identity, status: "capture-failed" });
    await expect(saveCorpusCheckpoint(evidence, directory)).rejects.toThrow("Duplicate");
    evidence.comparisons = [{ ...identity, width: 500, status: "capture-failed" }];
    await expect(saveCorpusCheckpoint(evidence, directory)).rejects.toThrow("unexpected");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("source hash includes nested and untracked converter and tooling files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-source-digest-"));
  try {
    for (const path of ["package.json", "bun.lock", "tsconfig.json", "tsconfig.build.json"]) await writeFile(join(directory, path), "{}");
    await mkdir(join(directory, "src", "nested"), { recursive: true });
    await mkdir(join(directory, "tools", "verify", "nested"), { recursive: true });
    const source = join(directory, "src", "nested", "new.ts");
    await writeFile(source, "export const value = 1;");
    const before = await sourceDigest(directory);
    await writeFile(source, "export const value = 2;");
    const changed = await sourceDigest(directory); expect(changed).not.toBe(before);
    await writeFile(join(directory, "tools", "verify", "nested", "new.html"), "<p>new fixture</p>");
    expect(await sourceDigest(directory)).not.toBe(changed);
    const current = await sourceDigest(directory); expect(await sourceDigest(directory)).toBe(current);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
