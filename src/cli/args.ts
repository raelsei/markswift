import type { ConvertOptions } from "../api/types.ts";
import { validateName } from "../compiler/naming.ts";

export class UsageError extends Error {}

export interface ConversionCommand {
  kind: "convert";
  source: { file: string } | { url: string } | { stdin: true };
  outDir: string;
  cssPath?: string;
  options: Pick<ConvertOptions, "name" | "root" | "theme" | "darkClass" | "mode" | "viewport">;
}

export type Command = { kind: "help" } | { kind: "version" } | ConversionCommand;

export const HELP = `Markswift — convert rendered HTML and CSS to SwiftUI.

Usage:
  markswift convert <file.html|-> --out <directory> [options]
  markswift convert --url <http(s)://...> --out <directory> [options]
  markswift --help | --version

Inputs:
  <file.html>       HTML document or fragment; relative assets use its directory
  -                 Read HTML from stdin (inline/data assets only)
  --url <url>       Capture a running HTTP or HTTPS page
  --css <file>      Optional compiled CSS file

Options:
  --out <directory> Required. Must not already exist; writes every Swift file and asset
  --name <Name>     Swift view name (default: ConvertedView)
  --root <selector> Capture only this CSS selector
  --width <px>      Viewport width (default: 390)
  --height <px>     Viewport height (default: 844)
  --theme <value>   adaptive, light or dark (default: adaptive). adaptive captures the page in
                    light and dark (prefers-color-scheme) and emits one view that follows both
  --dark-class <name>
                    Class added to <html> for the dark capture (class-based themes, e.g. dark)
  --mode <value>    app or fidelity (default: app)
  -h, --help        Show this help
  -v, --version     Show version

Requires Bun and Google Chrome. CSS must already be compiled; JavaScript behavior is not translated.
`;

const valueFlags = new Set([
  "--out",
  "--url",
  "--css",
  "--name",
  "--root",
  "--width",
  "--height",
  "--theme",
  "--dark-class",
  "--mode",
]);

export function parseArgs(args: string[]): Command {
  if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0]!))) return { kind: "help" };
  if (args.length === 1 && ["--version", "-v"].includes(args[0]!)) return { kind: "version" };
  if (args[0] !== "convert") throw new UsageError(`Unknown command: ${args[0]}`);
  if (args.slice(1).some((arg) => arg === "--help" || arg === "-h")) return { kind: "help" };

  const values = new Map<string, string>();
  const positional: string[] = [];
  let afterDoubleDash = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--" && !afterDoubleDash) {
      afterDoubleDash = true;
      continue;
    }
    if (!afterDoubleDash && valueFlags.has(arg)) {
      if (values.has(arg)) throw new UsageError(`Repeated option: ${arg}`);
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new UsageError(`Missing value for ${arg}`);
      values.set(arg, value);
    } else if (!afterDoubleDash && arg.startsWith("-") && arg !== "-") {
      throw new UsageError(`Unknown option: ${arg}`);
    } else positional.push(arg);
  }

  const outDir = values.get("--out");
  if (!outDir) throw new UsageError("--out is required");
  const url = values.get("--url");
  if (positional.length + (url ? 1 : 0) !== 1) throw new UsageError("Choose exactly one HTML file, -, or --url");
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    } catch {
      throw new UsageError("--url requires an HTTP or HTTPS URL");
    }
  }
  const source = url ? { url } : positional[0] === "-" ? { stdin: true as const } : { file: positional[0]! };
  const width = dimension(values.get("--width"), "--width", 390);
  const height = dimension(values.get("--height"), "--height", 844);
  const theme = values.get("--theme") ?? "adaptive";
  const mode = values.get("--mode") ?? "app";
  const name = values.get("--name");
  if (name !== undefined) {
    try {
      validateName(name);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }
  if (theme !== "light" && theme !== "dark" && theme !== "adaptive")
    throw new UsageError("--theme must be adaptive, light or dark");
  const darkClass = values.get("--dark-class");
  if (darkClass !== undefined && !/^\S+$/.test(darkClass))
    throw new UsageError("--dark-class must be a single class name");
  if (mode !== "app" && mode !== "fidelity") throw new UsageError("--mode must be app or fidelity");
  return {
    kind: "convert",
    source,
    outDir,
    cssPath: values.get("--css"),
    options: { name, root: values.get("--root"), theme, darkClass, mode, viewport: { width, height } },
  };
}

function dimension(value: string | undefined, flag: string, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0)
    throw new UsageError(`${flag} must be a positive integer`);
  return parsed;
}
