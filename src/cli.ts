#!/usr/bin/env node
import { HELP, parseArgs, UsageError } from "./cli/args.ts";
import { EditedFilesError } from "./cli/manifest.ts";
import { runBuild, runConversion } from "./cli/run.ts";
import { VERSION } from "./model/version.ts";

async function main(): Promise<number> {
  try {
    const command = parseArgs(process.argv.slice(2));
    if (command.kind === "help") {
      process.stdout.write(HELP);
      return 0;
    }
    if (command.kind === "version") {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (command.kind === "build") await runBuild(command);
    else await runConversion(command);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      const help = process.argv[2] === "build" ? "build" : "convert";
      process.stderr.write(`${error.message}\nRun markswift ${help} --help for usage.\n`);
      return 2;
    }
    if (error instanceof EditedFilesError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

process.exitCode = await main();
