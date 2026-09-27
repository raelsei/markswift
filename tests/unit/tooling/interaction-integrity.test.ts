import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "../../../tools/verify/corpus-evidence.ts";
import { interactionArtifactHashes, verifyInteractionSources } from "../../../tools/verify/interaction/integrity.ts";
import type { InteractionManifest } from "../../../tools/verify/interaction/types.ts";

test("prepared input verification detects a host mutation after an earlier successful read", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-ui-integrity-"));
  try {
    await mkdir(join(directory, "App")); await writeFile(join(directory, "App/Host.swift"), "original host");
    const manifest = { generatedFiles: { "App/Host.swift": digest("original host") } } satisfies Pick<InteractionManifest, "generatedFiles">;
    await verifyInteractionSources(directory, manifest);
    await writeFile(join(directory, "App/Host.swift"), "changed during execution");
    await expect(verifyInteractionSources(directory, manifest)).rejects.toThrow("Prepared interaction source changed");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("actual XCTest artifact hashes include result bytes and attachments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-ui-artifacts-")), bundle = join(directory, "Interactions.xcresult");
  try {
    for (const name of ["xcodebuild.log", "xcresult-tests.json", "prepared.json"]) await writeFile(join(directory, name), name);
    await mkdir(join(bundle, "Data"), { recursive: true });
    const attachment = join(bundle, "Data/screenshot-data"); await writeFile(attachment, new Uint8Array([0, 128, 255]));
    const hashes = await interactionArtifactHashes(directory, bundle);
    expect(Object.keys(hashes)).toHaveLength(4); expect(hashes[attachment]).toBe(digest(new Uint8Array([0, 128, 255])));
    await writeFile(attachment, new Uint8Array([0, 128, 254]));
    expect(digest(await readFile(attachment))).not.toBe(hashes[attachment]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
