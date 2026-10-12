import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { BuildComponent, BuildOptions } from "../api/build.ts";
import { validateLibrary, type PaletteMap } from "../compiler/index.ts";
import type { ConversionWarning } from "../model/semantic.ts";
import { UsageError } from "./args.ts";
import { inlineRelativeUrls } from "./css.ts";

const Viewport = z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const Shared = {
  root: z.string().min(1).optional(),
  viewport: Viewport.optional(),
  theme: z.enum(["adaptive", "light", "dark"]).optional(),
  darkClass: z.string().regex(/^\S+$/).optional(),
  mode: z.enum(["app", "fidelity"]).optional(),
  css: z.string().min(1).optional(),
  waitFor: z.string().min(1).optional(),
};
/** `markswift.json`: one library, its output directory, shared capture settings and the components (each may override them). */
export const BuildConfig = z
  .object({
    library: z.string(),
    out: z.string().min(1),
    serve: z.string().min(1).optional(),
    timeoutMs: z.number().positive().optional(),
    palette: z.string().min(1).optional(),
    ...Shared,
    components: z.array(z.object({ name: z.string(), source: z.string().min(1), ...Shared }).strict()).min(1),
  })
  .strict();

/** `--palette` / `palette` file: CSS variable or hex key → one-line Swift `Color` expression. */
export const PaletteMapFile = z.record(
  z
    .string()
    .regex(
      /^(--[A-Za-z0-9_-]+|#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?(\/#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?)?)$/,
      "key must be --name, #rrggbb[aa] or #light/#dark",
    ),
  z
    .string()
    .min(1)
    .refine((v) => !/[\r\n\u2028\u2029]/.test(v), "value must be a single-line Swift expression"),
);

/** Read and validate a palette map. A missing file is a plain `Error`; bad JSON or entries are `UsageError`s naming the key. */
export async function loadPalette(path: string): Promise<PaletteMap> {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) throw new Error(`palette map not found: ${path}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = PaletteMapFile.safeParse(json);
  if (!parsed.success)
    throw new UsageError(
      `Invalid palette map ${path}:\n${parsed.error.issues.map((i) => `  ${i.path.join(".") || "(top level)"}: ${i.code === "invalid_key" ? i.issues[0]?.message : i.message}`).join("\n")}`,
    );
  return parsed.data;
}

/**
 * Read and validate a build config. Paths (`out`, `serve`, `css`, `source`, `palette`) are relative to the config file's
 * directory; `serve` defaults to it. Config mistakes are `UsageError`s; a missing config, source, CSS or palette file is a
 * plain `Error`.
 */
export async function loadBuildConfig(
  path: string,
): Promise<{ out: string; options: BuildOptions; warnings: ConversionWarning[] }> {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (text === undefined) throw new Error(`Config file not found: ${path}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = BuildConfig.safeParse(json);
  if (!parsed.success)
    throw new UsageError(
      `Invalid config ${path}:\n${parsed.error.issues.map((i) => `  ${i.path.join(".") || "(top level)"}: ${i.message}`).join("\n")}`,
    );
  const config = parsed.data;
  try {
    validateLibrary(
      config.library,
      config.components.map((c) => c.name),
    );
  } catch (error) {
    throw new UsageError(`Invalid config ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const base = dirname(resolve(path));
  const warnings: ConversionWarning[] = [];
  const readCss = async (file: string, component?: string) => {
    const cssPath = resolve(base, file);
    const cssText = await readFile(cssPath, "utf8").catch(() => undefined);
    if (cssText === undefined) throw new Error(`CSS file not found: ${cssPath}`);
    const inlined = await inlineRelativeUrls(cssText, cssPath);
    for (const ref of inlined.missing)
      warnings.push({
        source: "build",
        message: `--css reference not found next to ${cssPath}: ${ref}`,
        ...(component ? { component } : {}),
      });
    return inlined.css;
  };
  const sharedCss = config.css === undefined ? undefined : await readCss(config.css);
  const components: BuildComponent[] = [];
  for (const c of config.components) {
    const isURL = URL.canParse(c.source) && ["http:", "https:"].includes(new URL(c.source).protocol);
    const file = resolve(base, c.source);
    if (
      !isURL &&
      !(await access(file).then(
        () => true,
        () => false,
      ))
    )
      throw new Error(`component ${c.name}: HTML file not found: ${file}`);
    const pick = <K extends keyof typeof Shared>(key: K) => c[key] ?? config[key];
    components.push({
      name: c.name,
      source: isURL ? { url: c.source } : { file },
      root: pick("root"),
      viewport: pick("viewport"),
      theme: pick("theme"),
      darkClass: pick("darkClass"),
      mode: pick("mode"),
      css: c.css === undefined ? sharedCss : await readCss(c.css, c.name),
      waitFor: pick("waitFor"),
    });
  }
  return {
    out: resolve(base, config.out),
    options: {
      library: config.library,
      components,
      serveRoot: resolve(base, config.serve ?? "."),
      timeoutMs: config.timeoutMs,
      palette: config.palette === undefined ? undefined : await loadPalette(resolve(base, config.palette)),
    },
    warnings,
  };
}
