import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, win32 } from "node:path";

/** Records what a run wrote, so `convert --update` rewrites exactly those files. */
export const MANIFEST = ".markswift.json";

export interface Manifest {
  tool: "markswift";
  version: string;
  /** POSIX relative path → lowercase hex SHA-256 of its bytes. */
  files: Record<string, string>;
}

export class EditedFilesError extends Error {
  readonly files: string[];

  constructor(files: string[], message: string) {
    super(message);
    this.files = files;
  }
}

/** Absolute, backslashed, empty-segment, `.` or `..` paths could escape the output directory. */
export function unsafePath(name: string): boolean {
  return (
    !name ||
    isAbsolute(name) ||
    win32.isAbsolute(name) ||
    name.includes("\\") ||
    name.split("/").some((part) => !part || part === "." || part === "..")
  );
}

export function manifestFor(files: Record<string, string | Uint8Array>, version: string): Manifest {
  const hashes = Object.entries(files)
    .filter(([name]) => name !== MANIFEST)
    .map(([name, contents]): [string, string] => [name, createHash("sha256").update(contents).digest("hex")])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { tool: "markswift", version, files: Object.fromEntries(hashes) };
}

export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** `undefined` when `dir` has no manifest; throws when it is malformed or written by another tool. */
export async function readManifest(dir: string): Promise<Manifest | undefined> {
  let text: string;
  try {
    text = await readFile(join(dir, MANIFEST), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  const m = value as Partial<Manifest> | undefined;
  const valid =
    typeof m === "object" &&
    m !== null &&
    m.tool === "markswift" &&
    typeof m.version === "string" &&
    typeof m.files === "object" &&
    m.files !== null &&
    !Array.isArray(m.files) &&
    Object.entries(m.files).every(
      ([name, hash]) => !unsafePath(name) && typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash),
    );
  if (!valid) throw new Error(`${dir}/${MANIFEST} is not a Markswift manifest`);
  return m as Manifest;
}

/** Listed files whose bytes no longer match; a missing listed file is not edited (it is simply recreated). */
export async function editedFiles(dir: string, manifest: Manifest): Promise<string[]> {
  const edited: string[] = [];
  for (const name of Object.keys(manifest.files).sort()) {
    const file = join(dir, name);
    let stats: Stats;
    try {
      stats = await lstat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (
      !stats.isFile() ||
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex") !== manifest.files[name]
    )
      edited.push(name);
  }
  return edited;
}
