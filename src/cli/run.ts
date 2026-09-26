import { readFile, stat } from "node:fs/promises";
import { convert } from "../api/convert.ts";
import { convertResponsive } from "../api/responsive.ts";
import type { HtmlSource } from "../input/types.ts";
import type { ConversionCommand } from "./args.ts";
import { ensureVacant, writeBundle } from "./output.ts";

export async function runConversion(command: ConversionCommand): Promise<void> {
  await ensureVacant(command.outDir);
  if ("file" in command.source) {
    try {
      if (!(await stat(command.source.file)).isFile()) throw new Error(`HTML path is not a file: ${command.source.file}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`HTML file not found: ${command.source.file}`);
      throw error;
    }
  }
  const source: HtmlSource = "stdin" in command.source
    ? { html: await readStdin() }
    : command.source;
  let css: string | undefined;
  if (command.cssPath) {
    try {
      css = await readFile(command.cssPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`CSS file not found: ${command.cssPath} (--css is optional)`);
      throw error;
    }
  }
  if (command.responsive) {
    const { compactWidth, breakpoint } = command.responsive;
    const { viewport, name, ...shared } = command.options;
    const regularViewport = viewport ?? { width: 390, height: 844 };
    const result = await convertResponsive(source, {
      ...shared, css, name: name ?? "ConvertedView", breakpoint,
      compact: { viewport: { width: compactWidth, height: regularViewport.height } },
      regular: { viewport: regularViewport },
    });
    const files = await writeBundle(result, command.outDir);
    process.stdout.write(`Wrote ${files.length} files for ${result.name} to ${command.outDir}\n`);
    for (const [index, view] of result.views.entries()) {
      const branch = index === 0 ? "compact" : "regular";
      const { total, mapped, approximated, unmapped } = view.mapping;
      const percent = total === 0 ? 0 : mapped / total * 100;
      process.stdout.write(`Node mapping (${branch}): ${mapped}/${total} mapped (${percent.toFixed(1)}%); ${approximated} approximated; ${unmapped} unmapped. Visual fidelity not measured.\n`);
      for (const diagnostic of view.diagnostics) {
        for (const note of diagnostic.notes) process.stderr.write(`Note ${branch} ${diagnostic.id}: ${note}\n`);
      }
    }
    for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
    return;
  }
  const result = await convert(source, { ...command.options, css });
  const files = await writeBundle(result, command.outDir);
  process.stdout.write(`Wrote ${files.length} files for ${result.name} to ${command.outDir}\n`);
  const { total, mapped, approximated, unmapped } = result.mapping;
  const percent = total === 0 ? 0 : mapped / total * 100;
  process.stdout.write(`Node mapping: ${mapped}/${total} mapped (${percent.toFixed(1)}%); ${approximated} approximated; ${unmapped} unmapped. Visual fidelity not measured.\n`);
  for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
  for (const diagnostic of result.diagnostics) {
    for (const note of diagnostic.notes) process.stderr.write(`Note ${diagnostic.id}: ${note}\n`);
  }
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let html = "";
  for await (const chunk of process.stdin) html += chunk;
  return html;
}
