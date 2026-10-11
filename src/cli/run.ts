import { convert } from "../api/convert.ts";
import type { HtmlSource } from "../input/types.ts";
import { VERSION } from "../model/version.ts";
import type { ConversionCommand } from "./args.ts";
import { inlineRelativeUrls } from "./css.ts";
import { ensureVacant, formatDiagnostics, formatWarning, updatable, updateBundle, writeBundle } from "./output.ts";

export async function runConversion(command: ConversionCommand): Promise<void> {
  if (command.update) await updatable(command.outDir, command.force);
  else await ensureVacant(command.outDir);
  if ("file" in command.source && !(await Bun.file(command.source.file).exists())) {
    throw new Error(`HTML file not found: ${command.source.file}`);
  }
  const source: HtmlSource = "stdin" in command.source ? { html: await Bun.stdin.text() } : command.source;
  let css: string | undefined;
  if (command.cssPath) {
    const cssFile = Bun.file(command.cssPath);
    if (!(await cssFile.exists())) throw new Error(`CSS file not found: ${command.cssPath} (--css is optional)`);
    const inlined = await inlineRelativeUrls(await cssFile.text(), command.cssPath);
    css = inlined.css;
    for (const ref of inlined.missing)
      process.stderr.write(`Warning: --css reference not found next to ${command.cssPath}: ${ref}\n`);
  }
  const result = await convert(source, { ...command.options, css });
  const files = command.update
    ? await updateBundle(result, command.outDir, { version: VERSION, force: command.force })
    : await writeBundle(result, command.outDir, { version: VERSION });
  process.stdout.write(
    command.update
      ? `Updated ${files.length} files for ${result.name} in ${command.outDir}\n`
      : `Wrote ${files.length} files for ${result.name} to ${command.outDir}\n`,
  );
  for (const warning of result.warnings) process.stderr.write(`Warning: ${formatWarning(warning)}\n`);
  for (const line of formatDiagnostics(result.diagnostics)) process.stderr.write(`Note ${line}\n`);
}
