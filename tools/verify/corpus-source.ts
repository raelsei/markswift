import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

export const sourceDigestPolicy = "sorted-all-source-tooling-resource-lock-config-v3";
export const sourceConfigPaths = ["package.json", "bun.lock", "tsconfig.json", "tsconfig.build.json"] as const;
const excluded = new Set(["node_modules", "__pycache__", ".build", ".DS_Store", ".markswift-cache"]);

/** Include every production/helper/resource input, independent of file extension. */
export async function sourcePaths(cwd: string): Promise<string[]> {
  const paths: string[] = [...sourceConfigPaths];
  for (const path of [...sourceConfigPaths, "src", "tools", "tools/verify"]) {
    if ((await lstat(join(cwd, path))).isSymbolicLink()) throw new Error(`Source symlink is unsupported: ${path}`);
  }
  for (const root of ["src", "tools/verify"]) {
    for await (const path of new Bun.Glob(`${root}/**/*`).scan({ cwd, onlyFiles: false, followSymlinks: false, dot: true })) {
      if (path.split("/").some(part => excluded.has(part)) || path.endsWith(".pyc")) continue;
      const stat = await lstat(join(cwd, path));
      if (stat.isSymbolicLink()) throw new Error(`Source symlink is unsupported: ${path}`);
      if (stat.isFile()) paths.push(path);
    }
  }
  return paths.sort();
}

export async function sourceFileHashes(cwd: string): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all((await sourcePaths(cwd)).map(async path =>
    [path, createHash("sha256").update(await readFile(join(cwd, path))).digest("hex")])));
}
export function fileManifestDigest(files: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, "en")))).digest("hex");
}
export async function sourceDigest(cwd: string): Promise<string> {
  return fileManifestDigest(await sourceFileHashes(cwd));
}
