import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { DEFAULT_ROOT } from "../input/root.ts";
import { serveDir, type StaticServer } from "../input/server.ts";
import { BrowserCapture, type Capture } from "../browser/capture.ts";
import {
  compileLayouts,
  validateLibrary,
  type CompileResult,
  type EmitMode,
  type PaletteMap,
} from "../compiler/index.ts";
import { packageFonts } from "../fonts/package.ts";
import { registrationSwift } from "../fonts/registration.ts";
import { bundledFamilies, metricsForFonts } from "../fonts/metadata.ts";
import type { Theme } from "../model/layout.ts";
import type { ConversionWarning } from "../model/semantic.ts";
import { GENERATED_BY } from "../model/version.ts";
import { unionFaces } from "./convert.ts";
import { captureBands, captureThemes, planFor, validateBreakpoints } from "./bands.ts";
import type { ConvertOptions } from "./types.ts";

export interface BuildComponent {
  /** Swift view name, e.g. `AccordionView`. */
  name: string;
  /** `file`: path inside `serveRoot`; `url`: a running http(s) page. */
  source: { file: string } | { url: string };
  root?: string;
  theme?: Theme | "adaptive";
  darkClass?: string;
  /** Already compiled CSS injected into the page. */
  css?: string;
  waitFor?: string;
  mode?: EmitMode;
  viewport?: { width: number; height: number };
  /** Capture every CSS width band and emit one view across them, as `convert`'s `breakpoints`. */
  breakpoints?: ConvertOptions["breakpoints"];
}

export interface BuildOptions {
  /** Swift package, product, target and module name. */
  library: string;
  components: BuildComponent[];
  /** Directory served at http://127.0.0.1:<port>/ for every `file` source (relative URLs such as `../assets/x.woff2` resolve inside it). */
  serveRoot?: string;
  /** Whole-build deadline in ms. Default 600000. */
  timeoutMs?: number;
  /** App colours for the library's `Palette` tokens; unmapped tokens and unused keys become warnings. */
  palette?: PaletteMap;
}

export interface BuildResult {
  /** Package files relative to the package root (`Package.swift`, `Sources/<library>/…`). */
  files: Record<string, string>;
  assets: Record<string, Uint8Array>;
  /** Page and compile warnings carry `component`; font notes and config-level (`source: "build"`) ones may not. */
  warnings: ConversionWarning[];
  diagnostics: Record<string, CompileResult["diagnostics"]>;
}

const RUNTIME_BUNDLE = "static var bundle: Bundle = .main";

/**
 * Capture every component in one browser session per viewport and emit ONE local SwiftPM package: a module-level
 * `Palette`, one copy of each shape, font and image, one runtime, public views.
 */
export async function buildLibrary(options: BuildOptions): Promise<BuildResult> {
  const { library, components } = options;
  validateLibrary(
    library,
    components.map((c) => c.name),
  );
  const timeoutMs = options.timeoutMs ?? 600_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive and finite");
  const serveRoot = options.serveRoot === undefined ? undefined : resolve(options.serveRoot);
  for (const c of components) {
    const { width, height } = c.viewport ?? { width: 390, height: 844 };
    if (![width, height].every((n) => Number.isInteger(n) && n > 0))
      throw new Error(`component ${c.name}: viewport dimensions must be positive integers`);
    if (c.darkClass !== undefined && !/^\S+$/.test(c.darkClass))
      throw new Error(`component ${c.name}: darkClass must be a single class name`);
    validateBreakpoints(c.breakpoints, `component ${c.name}: `);
    if ("url" in c.source) {
      const protocol = URL.canParse(c.source.url) ? new URL(c.source.url).protocol : "";
      if (protocol !== "http:" && protocol !== "https:")
        throw new Error(`component ${c.name}: only http and https page URLs are supported`);
    } else if (!serveRoot) throw new Error(`component ${c.name}: a file source needs serveRoot`);
    else if (!resolve(serveRoot, c.source.file).startsWith(serveRoot + sep))
      throw new Error(`component ${c.name}: ${c.source.file} is outside serveRoot ${serveRoot}`);
  }

  const deadline = AbortSignal.timeout(timeoutMs);
  const renderers = new Map<string, { capture: BrowserCapture; started: Promise<void> }>();
  // A renderer still launching has no browser to close yet: wait for its launch, then stop it.
  const stopAll = () =>
    Promise.allSettled([...renderers.values()].map((r) => r.started.finally(() => r.capture.stop())));
  // As in `convert`: a `newPage` in flight never settles when its context closes, so every capture races the deadline.
  const stopOnTimeout = () => void stopAll();
  deadline.addEventListener("abort", stopOnTimeout, { once: true });
  const timedOut = new Promise<never>((_, reject) =>
    deadline.addEventListener("abort", () => reject(deadline.reason), { once: true }),
  );
  timedOut.catch(() => {});
  let server: StaticServer | undefined;
  try {
    if (components.some((c) => "file" in c.source)) server = await serveDir(serveRoot!);
    const captureOne = async (c: BuildComponent) => {
      const viewport = c.viewport ?? { width: 390, height: 844 };
      const key = `${viewport.width}x${viewport.height}`;
      let renderer = renderers.get(key);
      if (!renderer) {
        const capture = new BrowserCapture({ viewport, dpr: 1, signal: deadline });
        renderer = { capture, started: capture.start() };
        renderers.set(key, renderer);
      }
      await Promise.race([renderer.started, timedOut]);
      deadline.throwIfAborted(); // the deadline fired mid-launch, before there was a browser to close
      let page: { url: string; html?: string; label: string };
      if ("url" in c.source) page = { url: c.source.url, label: c.source.url };
      else {
        const path = relative(serveRoot!, resolve(serveRoot!, c.source.file));
        page = {
          url: `${server!.origin}/${path.split(sep).map(encodeURIComponent).join("/")}`,
          html: await readFile(resolve(serveRoot!, c.source.file), "utf8"),
          label: path.split(sep).join("/"),
        };
      }
      const req = {
        name: c.name,
        ...page,
        root: c.root ?? DEFAULT_ROOT,
        theme: c.theme ?? "adaptive",
        css: c.css,
        darkClass: c.darkClass,
        waitFor: c.waitFor,
        layers: true,
        // Width media queries are reconstructed: the captures do not report them as losses.
        ...(c.breakpoints ? { breakpoints: true } : {}),
      };
      const first = await captureThemes(renderer.capture, req, timedOut);
      if (!c.breakpoints) return { bands: [first], notes: [] };
      // Band 0 is the emitted capture; the others reuse its renderer at their own viewport, without the layer pass.
      const plan = planFor(c.breakpoints, first.primary.layout.conditions, viewport);
      const bands = await captureBands(renderer.capture, req, { viewport, captured: first }, plan, timedOut);
      return { bands, notes: plan.notes };
    };
    // ponytail: fixed 4-way capture concurrency (6.5 s vs 20 s for 61 pages, layouts byte-identical); make it a flag if a machine chokes
    const captured: Array<{ bands: Array<{ primary: Capture; dark?: Capture }>; notes: string[] }> = [];
    let next = 0;
    const worker = async () => {
      for (let i = next++; i < components.length; i = next++) captured[i] = await captureOne(components[i]!);
    };
    await Promise.all(Array.from({ length: Math.min(4, components.length) }, worker));

    const all = captured.flatMap((c) => c.bands.flatMap((b) => (b.dark ? [b.primary, b.dark] : [b.primary])));
    const fonts = await packageFonts(
      unionFaces(all.map((c) => c.layout.fonts)),
      new Map(all.flatMap((c) => c.fontFiles).map((f) => [f.file, f.bytes])),
      undefined,
      deadline,
    );
    deadline.throwIfAborted();
    const compiled = compileLayouts(
      components.map((c, i) => {
        const [first, ...rest] = captured[i]!.bands;
        return {
          name: c.name,
          layout: first!.primary.layout,
          dark: first!.dark?.layout,
          mode: c.mode,
          ...(rest.length
            ? {
                variants: rest.map((b) => b.primary.layout),
                ...(first!.dark ? { darkVariants: rest.map((b) => b.dark!.layout) } : {}),
              }
            : {}),
        };
      }),
      {
        library,
        bundledFamilies: bundledFamilies(fonts),
        fontMetrics: metricsForFonts(fonts),
        registerFonts: fonts.faces.length > 0,
        palette: options.palette,
      },
    );

    const dir = `Sources/${library}/`;
    const files: Record<string, string> = {};
    const assets: Record<string, Uint8Array> = {};
    for (const [name, text] of Object.entries(compiled.files)) files[dir + name] = text;
    if (fonts.faces.length) files[`${dir}MarkswiftFonts.swift`] = registrationSwift(fonts.faces);
    for (const [name, bytes] of Object.entries({ ...compiled.assets, ...fonts.assets })) assets[dir + name] = bytes;
    const resources = ["Fonts", "Images"].filter((d) => Object.keys(assets).some((k) => k.startsWith(`${dir}${d}/`)));
    if (resources.length) {
      // ponytail: text swap keeps one runtime source; a runtime hook if the line ever moves
      const runtime = files[`${dir}MarkswiftRuntime.swift`]!.split(RUNTIME_BUNDLE);
      if (runtime.length !== 2) throw new Error(`MarkswiftRuntime.swift must contain "${RUNTIME_BUNDLE}" exactly once`);
      files[`${dir}MarkswiftRuntime.swift`] = runtime.join("static var bundle: Bundle = .module");
    }
    files["Package.swift"] = [
      "// swift-tools-version: 6.2",
      `// ${GENERATED_BY} — tool-owned: regenerate with \`markswift build\`.`,
      "import PackageDescription",
      "",
      "let package = Package(",
      `    name: "${library}",`,
      "    platforms: [.iOS(.v18), .macOS(.v15)],",
      `    products: [.library(name: "${library}", targets: ["${library}"])],`,
      "    targets: [",
      "        .target(",
      `            name: "${library}",`,
      ...(resources.length ? [`            resources: [${resources.map((d) => `.copy("${d}")`).join(", ")}],`] : []),
      "            swiftSettings: [.defaultIsolation(MainActor.self)]",
      "        ),",
      "    ]",
      ")",
      "",
    ].join("\n");

    const warnings = new Map<string, ConversionWarning>();
    const add = (w: ConversionWarning) => {
      const key = `${w.component ?? ""}\u0000${w.source}\u0000${w.message}`;
      if (!warnings.has(key)) warnings.set(key, w);
    };
    for (const [i, c] of components.entries()) {
      const { bands, notes } = captured[i]!;
      for (const w of bands.flatMap((b) => [...b.primary.warnings, ...(b.dark?.warnings ?? [])]))
        add({ ...w, component: c.name });
      for (const message of notes)
        add({ source: "capture", level: "approximated", feature: "media-query", component: c.name, message });
      for (const w of compiled.warnings) if (w.component === c.name) add(w);
    }
    for (const w of compiled.warnings) if (w.component === undefined) add(w);
    for (const w of fonts.notes) add(w);
    return { files, assets, warnings: [...warnings.values()], diagnostics: compiled.diagnostics };
  } catch (error) {
    if (deadline.aborted) throw new Error(`build timed out after ${timeoutMs} ms`, { cause: error });
    throw error;
  } finally {
    deadline.removeEventListener("abort", stopOnTimeout);
    try {
      await stopAll();
    } finally {
      server?.stop();
    }
  }
}
