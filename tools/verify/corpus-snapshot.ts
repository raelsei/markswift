import { chmod, cp, lstat, mkdir, readFile, readdir, readlink, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileManifestDigest, sourceDigest, sourceFileHashes, sourceDigestPolicy } from "./corpus-source.ts";

const metadataName = "source-snapshot.json";
export interface SourceSnapshot {
  version: 1; createdAt: string; originalDirectory: string; sourceHash: string; policy: string;
  files: Record<string, string>; dependencies: Record<string, string>; dependencyHash: string;
  revision: string; dirtyHash: string;
}
const hash = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Capture once, execute from the copy, and keep root development independent of the run. */
export async function createSourceSnapshot(cwd: string, directory: string): Promise<SourceSnapshot> {
  const originalDirectory = resolve(cwd), target = resolve(directory);
  const files = await sourceFileHashes(originalDirectory), sourceHash = fileManifestDigest(files);
  const dependencies = await dependencyFiles(join(originalDirectory, "node_modules"));
  await mkdir(target, { recursive: false });
  for (const path of Object.keys(files)) {
    await mkdir(dirname(join(target, path)), { recursive: true });
    await cp(join(originalDirectory, path), join(target, path), { errorOnExist: true, force: false });
  }
  await cp(join(originalDirectory, "node_modules"), join(target, "node_modules"), { recursive: true, verbatimSymlinks: true });
  const packageName = await selfPackageName(originalDirectory);
  if (packageName && dependencies[packageName] === `link:${hash("@snapshot-root")}`) {
    const self = join(target, "node_modules", packageName);
    await unlink(self);
    await symlink(relative(dirname(self), target), self);
  }
  const metadata: SourceSnapshot = {
    version: 1, createdAt: new Date().toISOString(), originalDirectory, sourceHash, policy: sourceDigestPolicy,
    files, dependencies, dependencyHash: fileManifestDigest(dependencies),
    revision: await git(originalDirectory, ["rev-parse", "HEAD"]),
    dirtyHash: hash(await git(originalDirectory, ["diff", "HEAD", "--", "src", "tools", "tests", "package.json", "bun.lock", "tsconfig.json", "tsconfig.build.json"])),
  };
  await writeFile(join(target, metadataName), JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" });
  if (await sourceDigest(originalDirectory) !== sourceHash) throw new Error("Source changed while creating its snapshot; discard this draft and capture again");
  await verifySourceSnapshot(target);
  // Copied inputs are read-only. The harness writes into a separate absolute output directory.
  for (const path of Object.keys(files)) await chmod(join(target, path), 0o444);
  await chmod(join(target, metadataName), 0o444);
  return metadata;
}

export async function readSourceSnapshot(directory: string): Promise<SourceSnapshot | undefined> {
  let contents: string;
  try { contents = await readFile(join(directory, metadataName), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  const metadata = JSON.parse(contents) as SourceSnapshot;
  if (metadata.version !== 1 || metadata.policy !== sourceDigestPolicy || !metadata.sourceHash || !metadata.dependencyHash)
    throw new Error("Invalid source snapshot metadata");
  return metadata;
}
export async function verifySourceSnapshot(directory: string): Promise<SourceSnapshot> {
  const metadata = await readSourceSnapshot(directory);
  if (!metadata) throw new Error("Missing source snapshot metadata");
  if (fileManifestDigest(metadata.files) !== metadata.sourceHash || await sourceDigest(directory) !== metadata.sourceHash)
    throw new Error("Frozen source snapshot changed");
  if (fileManifestDigest(metadata.dependencies) !== metadata.dependencyHash ||
    fileManifestDigest(await dependencyFiles(join(directory, "node_modules"))) !== metadata.dependencyHash)
    throw new Error("Frozen dependency snapshot changed");
  return metadata;
}

/** Dependencies are copied, never symlinked to the mutable checkout. Hash links and bytes. */
async function dependencyFiles(directory: string): Promise<Record<string, string>> {
  const root = await lstat(directory);
  if (root.isSymbolicLink() || !root.isDirectory()) throw new Error("Dependency root must be a real directory; mutable root links are unsupported");
  const files: Record<string, string> = {};
  const packageName = await selfPackageName(dirname(directory));
  const dependencyRoot = await realpath(directory), sourceRoot = await realpath(dirname(directory));
  async function visit(current: string): Promise<void> {
    for (const name of (await readdir(current)).sort()) {
      const path = join(current, name), key = relative(directory, path), stat = await lstat(path);
      if (stat.isSymbolicLink()) {
        const link = await readlink(path);
        if (isAbsolute(link) && key !== packageName) throw new Error(`Dependency link escapes snapshot: ${key}`);
        // Resolve the actual link entry. Expanding its text with resolve/join (or Bun's
        // realpath on a raw '..' path) can normalize traversal before following links.
        const actual = await realpath(path);
        if (key === packageName && actual === sourceRoot) {
          files[key] = `link:${hash("@snapshot-root")}`;
          continue;
        }
        const destination = relative(dependencyRoot, actual);
        if (isAbsolute(link) || destination === ".." || destination.startsWith("../")) throw new Error(`Dependency link escapes snapshot: ${key}`);
        files[key] = `link:${hash(link)}`;
      } else if (stat.isDirectory()) await visit(path);
      else if (stat.isFile()) files[key] = hash(await readFile(path));
      else throw new Error(`Unsupported dependency input: ${key}`);
    }
  }
  await visit(directory);
  return files;
}
async function selfPackageName(directory: string): Promise<string | undefined> {
  const { name } = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as { name?: unknown };
  return typeof name === "string" && /^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(name) ? name : undefined;
}
async function git(cwd: string, args: string[]): Promise<string> {
  const process = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
  const output = await new Response(process.stdout).text();
  return await process.exited === 0 ? output.trim() : "unavailable";
}
