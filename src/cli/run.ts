import { convert } from "../api/convert.ts";
import type { HtmlSource } from "../input/types.ts";
import type { ConversionCommand } from "./args.ts";
import { inlineRelativeUrls } from "./css.ts";
import { ensureVacant, formatDiagnostics, writeBundle } from "./output.ts";

export async function runConversion(command: ConversionCommand): Promise<void> {
  await ensureVacant(command.outDir);
  if ("file" in command.source && !(await Bun.file(command.source.file).exists())) {
    throw new Error(`HTML file not found: ${command.source.file}`);
  }
  const source: HtmlSource = "stdin" in command.source
    ? { html: await Bun.stdin.text() }
    : command.source;
  let css: string | undefined;
  if (command.cssPath) {
    const cssFile = Bun.file(command.cssPath);
    if (!(await cssFile.exists())) throw new Error(`CSS file not found: ${command.cssPath} (--css is optional)`);
    const inlined = await inlineRelativeUrls(await cssFile.text(), command.cssPath);
    css = inlined.css;
    for (const ref of inlined.missing) process.stderr.write(`Warning: --css reference not found next to ${command.cssPath}: ${ref}\n`);
  }
  const result = await convert(source, { ...command.options, css });
  const files = await writeBundle(result, command.outDir);
  process.stdout.write(`Wrote ${files.length} files for ${result.name} to ${command.outDir}\n`);
  for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
  for (const line of formatDiagnostics(result.diagnostics)) process.stderr.write(`Note ${line}\n`);
}
