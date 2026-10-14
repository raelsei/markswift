import { lstat, mkdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ConversionResult } from "../api/types.ts";
import type { ConversionWarning, Diagnostic } from "../model/semantic.ts";
import {
  EditedFilesError,
  editedFiles,
  MANIFEST,
  type Manifest,
  manifestFor,
  readManifest,
  serializeManifest,
  unsafePath,
} from "./manifest.ts";

type Bundle = Pick<ConversionResult, "files" | "assets">;

export async function ensureVacant(directory: string): Promise<void> {
  try {
    await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Output directory already exists: ${directory} (use --update to regenerate a Markswift output)`);
}

function checkPaths(entries: Array<[string, unknown]>): void {
  const folded = new Set<string>();
  for (const [name] of entries) {
    if (unsafePath(name)) throw new Error(`Unsafe output path: ${name}`);
    if (folded.has(name.toLowerCase())) throw new Error(`Duplicate output path: ${name}`);
    folded.add(name.toLowerCase());
  }
}

/**
 * Pre-flight for `--update`: the manifest of the Markswift output in `directory`, `undefined` when it does not exist.
 * Throws when the directory was not written by Markswift or, unless `force`, when a listed file was edited by hand.
 */
export async function updatable(directory: string, force = false): Promise<Manifest | undefined> {
  const output = resolve(directory);
  try {
    await lstat(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const manifest = await readManifest(output);
  if (!manifest)
    throw new Error(
      `${output} exists but has no ${MANIFEST}; --update only rewrites directories Markswift wrote. Convert into a new --out or move this directory away.`,
    );
  const edited = await editedFiles(output, manifest);
  if (edited.length && !force)
    throw new EditedFilesError(
      edited,
      `Refusing to overwrite hand-edited files in ${output}: ${edited.join(", ")}. Move your changes into your own files (Markswift never touches files it did not write) or rerun with --force to discard them.`,
    );
  return manifest;
}

/** Write the complete conversion bundle and its manifest without replacing an existing directory. */
export async function writeBundle(result: Bundle, directory: string, options: { version: string }): Promise<string[]> {
  const entries = [...Object.entries(result.files), ...Object.entries(result.assets)];
  checkPaths(entries);
  const output = resolve(directory);
  await ensureVacant(output);
  await mkdir(dirname(output), { recursive: true });
  try {
    await mkdir(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`Output directory already exists: ${output}`);
    throw error;
  }
  try {
    for (const [name, contents] of entries) {
      const file = join(output, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, contents);
    }
    await writeFile(
      join(output, MANIFEST),
      serializeManifest(manifestFor(Object.fromEntries(entries), options.version)),
    );
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
  return entries.map(([name]) => name).sort();
}

/**
 * Regenerate a Markswift output in place: rewrite the files its manifest lists, delete listed files the new bundle no
 * longer produces, never touch anything else. Every refusal happens before the first write.
 */
export async function updateBundle(
  result: Bundle,
  directory: string,
  options: { version: string; force?: boolean },
): Promise<string[]> {
  const entries = [...Object.entries(result.files), ...Object.entries(result.assets)];
  checkPaths(entries);
  const output = resolve(directory);
  const old = await updatable(output, options.force);
  if (!old) return writeBundle(result, output, options);
  const fresh = new Set(entries.map(([name]) => name));
  const stale = Object.keys(old.files).filter((name) => !fresh.has(name));
  const unlisted: string[] = [];
  for (const name of [...fresh].sort()) {
    if (Object.hasOwn(old.files, name)) continue;
    try {
      await lstat(join(output, name));
      unlisted.push(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // --force never overrides this refusal: these files belong to the developer.
  if (unlisted.length)
    throw new EditedFilesError(
      unlisted,
      `Refusing to overwrite files Markswift did not write in ${output}: ${unlisted.join(", ")}. Rename or move them.`,
    );

  // ponytail: files are rewritten in place, not swapped atomically. A write failing midway keeps the old manifest, so
  // the next --update reports the half-written files as edited and needs --force; no user file is lost. Upgrade path:
  // write into a sibling temp dir and rename when interrupted runs matter.
  for (const [name, contents] of entries) {
    const file = join(output, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  for (const name of stale) {
    await rm(join(output, name), { force: true });
    for (let parent = dirname(name); parent !== "."; parent = dirname(parent)) {
      try {
        await rmdir(join(output, parent));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOTEMPTY" || code === "ENOENT") break;
        throw error;
      }
    }
  }
  const tmp = join(output, `${MANIFEST}.tmp`);
  await writeFile(tmp, serializeManifest(manifestFor(Object.fromEntries(entries), options.version)));
  await rename(tmp, join(output, MANIFEST));
  return [...fresh].sort();
}

/** A warning as one stderr line: `[<component>] <level> <feature>: <message>`; each prefix only when set. */
export function formatWarning(w: ConversionWarning): string {
  const loss = w.level && w.feature ? `${w.level} ${w.feature}: ` : "";
  return `${w.component ? `[${w.component}] ` : ""}${loss}${w.message}`;
}

/** One line per distinct (level, feature, message), unmapped first, naming the nodes it affects. */
export function formatDiagnostics(report: ConversionResult["diagnostics"]): string[] {
  const groups = new Map<string, { d: Diagnostic; ids: string[] }>();
  for (const node of report) {
    for (const d of node.diagnostics) {
      const key = `${d.level}\u0000${d.feature}\u0000${d.message}`;
      const group = groups.get(key) ?? { d, ids: [] };
      group.ids.push(node.id || node.kind);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        Number(b.d.level === "unmapped") - Number(a.d.level === "unmapped") || a.d.feature.localeCompare(b.d.feature),
    )
    .map(
      ({ d, ids }) =>
        `${d.level} ${d.feature}: ${d.message} [${ids.length} node${ids.length === 1 ? "" : "s"}: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", …" : ""}]`,
    );
}
