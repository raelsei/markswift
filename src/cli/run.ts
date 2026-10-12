import { access, readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { buildLibrary } from "../api/build.ts";
import { convert } from "../api/convert.ts";
import type { HtmlSource } from "../input/types.ts";
import { VERSION } from "../model/version.ts";
import type { BuildCommand, ConversionCommand } from "./args.ts";
import { loadBuildConfig } from "./config.ts";
import { inlineRelativeUrls } from "./css.ts";
import { ensureVacant, formatDiagnostics, formatWarning, updatable, updateBundle, writeBundle } from "./output.ts";

/** `markswift build`: capture every component of the config and regenerate one Swift package in its `out`. */
export async function runBuild(command: BuildCommand): Promise<void> {
  const config = await loadBuildConfig(command.configPath);
  // Refuse an unwritable `out` (no manifest, hand edits) before minutes of captures; `updateBundle` checks again.
  await updatable(config.out, command.force);
  const result = await buildLibrary(config.options);
  const files = await updateBundle(result, config.out, { version: VERSION, force: command.force });
  process.stdout.write(
    `Wrote ${files.length} files for ${config.options.library} (${config.options.components.length} components) to ${config.out}\n`,
  );
  for (const warning of [...config.warnings, ...result.warnings])
    process.stderr.write(`Warning: ${formatWarning(warning)}\n`);
  for (const [component, report] of Object.entries(result.diagnostics))
    for (const line of formatDiagnostics(report)) process.stderr.write(`Note [${component}] ${line}\n`);
}

export async function runConversion(command: ConversionCommand): Promise<void> {
  if (command.update) await updatable(command.outDir, command.force);
  else await ensureVacant(command.outDir);
  if (
    "file" in command.source &&
    !(await access(command.source.file).then(
      () => true,
      () => false,
    ))
  ) {
    throw new Error(`HTML file not found: ${command.source.file}`);
  }
  const source: HtmlSource = "stdin" in command.source ? { html: await text(process.stdin) } : command.source;
  let css: string | undefined;
  if (command.cssPath) {
    const cssText = await readFile(command.cssPath, "utf8").catch(() => undefined);
    if (cssText === undefined) throw new Error(`CSS file not found: ${command.cssPath} (--css is optional)`);
    const inlined = await inlineRelativeUrls(cssText, command.cssPath);
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
