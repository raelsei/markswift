#!/usr/bin/env bun
import { HELP, parseArgs, UsageError } from "./cli/args.ts";
import { runConversion } from "./cli/run.ts";
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
    await runConversion(command);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\nRun markswift convert --help for usage.\n`);
      return 2;
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

process.exitCode = await main();
