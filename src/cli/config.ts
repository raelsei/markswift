import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { BuildComponent, BuildOptions } from "../api/build.ts";
import { validateLibrary } from "../compiler/index.ts";
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
    ...Shared,
    components: z.array(z.object({ name: z.string(), source: z.string().min(1), ...Shared }).strict()).min(1),
  })
  .strict();

/**
 * Read and validate a build config. Paths (`out`, `serve`, `css`, `source`) are relative to the config file's directory;
 * `serve` defaults to it. Config mistakes are `UsageError`s; a missing config, source or CSS file is a plain `Error`.
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
    },
    warnings,
  };
}
