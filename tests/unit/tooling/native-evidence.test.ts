import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeArtifactHashes, requireNativeSnapshotTest, requireUnchangedNativeInputs, verifyNativeRenderEvidence } from "../../../tools/verify/native-evidence.ts";

const executed = { nodeType: "Test Case", nodeIdentifier: "PreviewTests/testSnapshots()", name: "testSnapshots()", result: "Passed" };

test("native render acceptance requires exactly the executed snapshot XCTest", () => {
  expect(() => requireNativeSnapshotTest({ testNodes: [{ children: [executed] }] })).not.toThrow();
  for (const cases of [[], [executed, executed], [{ ...executed, result: "Skipped" }], [{ ...executed, result: "Failed" }],
    [{ ...executed, nodeIdentifier: "OtherTests/testSnapshots()" }], [{ ...executed, nodeType: "Test Suite" }]]) {
    expect(() => requireNativeSnapshotTest({ testNodes: cases })).toThrow("XCTest");
  }
});

test("native evidence rehashes actual result attachments and rejects changed or added compiled inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-render-evidence-"));
  try {
    const sources = join(directory, "Sources"), bundle = join(directory, "Actual.xcresult");
    await mkdir(sources); await mkdir(join(bundle, "Data"), { recursive: true });
    await writeFile(join(sources, "View.swift"), "Original");
    await writeFile(join(bundle, "Data", "attachment"), new Uint8Array([1, 2]));
    const inputs = await nativeArtifactHashes([sources]), first = await nativeArtifactHashes([bundle]);
    expect(Object.keys(first)).toEqual([join(bundle, "Data", "attachment")]);
    expect(() => requireUnchangedNativeInputs(inputs, inputs)).not.toThrow();
    await writeFile(join(bundle, "Data", "attachment"), new Uint8Array([2, 1]));
    expect(await nativeArtifactHashes([bundle])).not.toEqual(first);
    await writeFile(join(sources, "View.swift"), "Mutated");
    const mutated = await nativeArtifactHashes([sources]);
    expect(() => requireUnchangedNativeInputs(inputs, mutated)).toThrow("changed");
    await writeFile(join(sources, "View.swift"), "Original");
    await writeFile(join(sources, "Injected.swift"), "Extra");
    const injected = await nativeArtifactHashes([sources]);
    expect(() => requireUnchangedNativeInputs(inputs, injected)).toThrow("changed");
    await symlink(join(bundle, "Data", "attachment"), join(bundle, "link"));
    await expect(nativeArtifactHashes([bundle])).rejects.toThrow("link");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("final native acceptance re-enumerates the complete compiled input tree", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-final-native-inputs-"));
  try {
    const sources = join(directory, "Sources"), tests = join(directory, "Tests"), execution = join(directory, "executions", "run");
    await mkdir(sources); await mkdir(tests); await mkdir(execution, { recursive: true });
    await writeFile(join(directory, "Package.swift"), "Original package");
    await writeFile(join(sources, "View.swift"), "Original view"); await writeFile(join(tests, "Test.swift"), "Original test");
    const inputs = await nativeArtifactHashes([join(directory, "Package.swift"), sources, tests]);
    const report = join(execution, "xcresult-tests.json"), receipt = join(execution, "receipt.json"), output = join(directory, "image.png");
    await writeFile(report, JSON.stringify({ testNodes: [executed] })); await writeFile(output, "image");
    const outputs = await nativeArtifactHashes([output]);
    await writeFile(receipt, JSON.stringify({ version: 1, exitCode: 0, test: "PreviewTests/testSnapshots()",
      resultBundle: join(execution, "NativeRender.xcresult"), report, inputs, outputs }));
    const artifacts = { ...inputs, ...await nativeArtifactHashes([receipt, report]) };
    await writeFile(join(sources, "Unexpected.swift"), "Injected after execution");
    await expect(verifyNativeRenderEvidence(artifacts, outputs)).rejects.toThrow("inputs changed");
    await rm(join(sources, "Unexpected.swift"));
    delete artifacts[join(sources, "View.swift")];
    await expect(verifyNativeRenderEvidence(artifacts, outputs)).rejects.toThrow("inputs changed");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
