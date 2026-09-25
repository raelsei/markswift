import { lstat, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, win32 } from "node:path";
import type { ConversionResult } from "../api/types.ts";

export async function ensureVacant(directory: string): Promise<void> {
  try {
    await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Output directory already exists: ${directory}`);
}

/** Write the complete conversion bundle without replacing an existing directory. */
export async function writeBundle(result: Pick<ConversionResult, "files" | "assets">, directory: string): Promise<string[]> {
  const entries = [...Object.entries(result.files), ...Object.entries(result.assets)];
  const names = new Set<string>();
  const folded = new Set<string>();
  for (const [name] of entries) {
    if (!name || isAbsolute(name) || win32.isAbsolute(name) || name.includes("\\") || name.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`Unsafe output path: ${name}`);
    }
    if (folded.has(name.toLowerCase())) throw new Error(`Duplicate output path: ${name}`);
    names.add(name);
    folded.add(name.toLowerCase());
  }
  const output = resolve(directory);
  await ensureVacant(output);
  await mkdir(dirname(output), { recursive: true });
  try {
    await mkdir(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Output directory already exists: ${output}`);
    throw error;
  }
  try {
    for (const [name, contents] of entries) {
      const file = join(output, name);
      await mkdir(dirname(file), { recursive: true });
      await Bun.write(file, contents);
    }
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
  return [...names].sort();
}
