import { lstat, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, win32 } from "node:path";
import type { ConversionResult } from "../api/types.ts";
import type { Diagnostic } from "../model/semantic.ts";

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
  const folded = new Set<string>();
  for (const [name] of entries) {
    if (!name || isAbsolute(name) || win32.isAbsolute(name) || name.includes("\\") || name.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`Unsafe output path: ${name}`);
    }
    if (folded.has(name.toLowerCase())) throw new Error(`Duplicate output path: ${name}`);
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
  return entries.map(([name]) => name).sort();
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
    .sort((a, b) => Number(b.d.level === "unmapped") - Number(a.d.level === "unmapped") || a.d.feature.localeCompare(b.d.feature))
    .map(({ d, ids }) => `${d.level} ${d.feature}: ${d.message} [${ids.length} node${ids.length === 1 ? "" : "s"}: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", …" : ""}]`);
}
