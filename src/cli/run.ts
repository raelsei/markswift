import { convert } from "../api/convert.ts";
import type { HtmlSource } from "../input/types.ts";
import type { ConversionCommand } from "./args.ts";
import { ensureVacant, writeBundle } from "./output.ts";

export async function runConversion(command: ConversionCommand): Promise<void> {
  await ensureVacant(command.outDir);
  const source: HtmlSource = "stdin" in command.source
    ? { html: await Bun.stdin.text() }
    : command.source;
  const css = command.cssPath ? await Bun.file(command.cssPath).text() : undefined;
  const result = await convert(source, { ...command.options, css });
  const files = await writeBundle(result, command.outDir);
  process.stdout.write(`Wrote ${files.length} files for ${result.name} to ${command.outDir}\n`);
  for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
  for (const diagnostic of result.diagnostics) {
    for (const note of diagnostic.notes) process.stderr.write(`Note ${diagnostic.id}: ${note}\n`);
  }
}
