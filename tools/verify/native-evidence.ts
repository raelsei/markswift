import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const command = promisify(execFile);

/** An image or successful process exit cannot substitute for an executed XCTest. */
export function requireNativeSnapshotTest(report: unknown): void {
  const cases: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    if (node.nodeType === "Test Case") cases.push(node);
    Object.values(node).forEach(visit);
  };
  visit(report);
  if (cases.length !== 1 || cases[0]!.nodeIdentifier !== "PreviewTests/testSnapshots()"
    || cases[0]!.name !== "testSnapshots()" || cases[0]!.result !== "Passed") {
    throw new Error("Native snapshot XCTest was missing, duplicated, skipped or failed");
  }
}

/** Read actual compiled inputs or XCTest bundles, including every attachment. */
export async function nativeArtifactHashes(roots: readonly string[]): Promise<Record<string, string>> {
  const paths = new Set<string>();
  async function visit(path: string): Promise<void> {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Native evidence link is unsupported: ${path}`);
    if (stat.isDirectory()) for (const name of (await readdir(path)).sort()) await visit(join(path, name));
    else if (stat.isFile()) paths.add(path);
    else throw new Error(`Native evidence is not a regular file: ${path}`);
  }
  for (const root of roots) await visit(root);
  return Object.fromEntries(await Promise.all([...paths].sort().map(async path =>
    [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
}

export function requireUnchangedNativeInputs(before: Record<string, string>, after: Record<string, string>): void {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  if ([...paths].some(path => before[path] !== after[path])) throw new Error("Native render inputs changed during execution");
}

/** Requery the actual XCResult and bind its executed test to every accepted output. */
export async function verifyNativeRenderEvidence(artifacts: Record<string, string>, outputs: Record<string, string>): Promise<void> {
  const receipts = Object.keys(artifacts).filter(path => path.endsWith("/receipt.json"));
  if (receipts.length !== 1 || !Object.keys(outputs).length) throw new Error("Native execution receipt is missing or ambiguous");
  const receipt = JSON.parse(await readFile(receipts[0]!, "utf8")) as {
    version: number; exitCode: number; test: string; resultBundle: string; report: string;
    inputs: Record<string, string>; outputs: Record<string, string>;
  };
  const directory = receipts[0]!.slice(0, -"receipt.json".length);
  if (receipt.version !== 1 || receipt.exitCode !== 0 || receipt.test !== "PreviewTests/testSnapshots()"
    || receipt.resultBundle !== `${directory}NativeRender.xcresult` || receipt.report !== `${directory}xcresult-tests.json`
    || !artifacts[receipt.report] || !Object.keys(receipt.inputs).length) throw new Error("Invalid native execution receipt");
  const work = resolve(dirname(receipts[0]!), "../..");
  if (resolve(directory, "..") !== join(work, "executions")) throw new Error("Invalid native execution location");
  const inputRoots = [join(work, "Package.swift"), join(work, "Sources"), join(work, "Tests")];
  requireUnchangedNativeInputs(receipt.inputs, await nativeArtifactHashes(inputRoots));
  const recordedInputs = Object.fromEntries(Object.entries(artifacts).filter(([path]) =>
    inputRoots.some(root => path === root || path.startsWith(`${root}/`))));
  requireUnchangedNativeInputs(receipt.inputs, recordedInputs);
  for (const [path, hash] of Object.entries(receipt.inputs)) {
    if (artifacts[path] !== hash) throw new Error("Native executed input binding changed");
  }
  for (const [path, hash] of Object.entries(outputs)) {
    if (receipt.outputs[path] !== hash) throw new Error("Native executed output binding changed");
  }
  const bundle = await nativeArtifactHashes([receipt.resultBundle]);
  const storedPaths = Object.keys(artifacts).filter(path => path.startsWith(`${receipt.resultBundle}/`));
  if (!storedPaths.length || storedPaths.length !== Object.keys(bundle).length
    || storedPaths.some(path => artifacts[path] !== bundle[path])) throw new Error("Native XCResult bytes changed or are incomplete");
  requireNativeSnapshotTest(JSON.parse(await readFile(receipt.report, "utf8")));
  const extracted = await command("xcrun", ["xcresulttool", "get", "test-results", "tests", "--schema-version", "0.4.0", "--path", receipt.resultBundle],
    { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
  requireNativeSnapshotTest(JSON.parse(extracted.stdout));
}
