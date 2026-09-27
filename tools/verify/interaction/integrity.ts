import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { digest } from "../corpus-evidence.ts";
import type { InteractionManifest } from "./types.ts";

export async function verifyInteractionSources(directory: string, manifest: Pick<InteractionManifest, "generatedFiles">): Promise<void> {
  for (const [path, hash] of Object.entries(manifest.generatedFiles)) {
    if (path.startsWith("/") || /[\\\x00-\x1f]/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Unsafe interaction manifest path");
    if (digest(await readFile(join(directory, path))) !== hash) throw new Error(`Prepared interaction source changed: ${path}`);
  }
}

/** Retain hashes of actual XCTest logs, reports and result-bundle bytes, including attachments. */
export async function interactionArtifactHashes(directory: string, resultBundle: string): Promise<Record<string, string>> {
  const paths = ["xcodebuild.log", "xcresult-tests.json", "prepared.json"].map(name => join(directory, name));
  async function visit(current: string): Promise<void> {
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Interaction result link is unsupported: ${current}`);
    if (stat.isFile()) paths.push(current);
    else if (stat.isDirectory()) for (const name of (await readdir(current)).sort()) await visit(join(current, name));
  }
  try { await visit(resultBundle); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(path))])));
}
