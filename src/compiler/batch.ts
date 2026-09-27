/** Compile several captured components into one Swift target and one shared helper set. */
import { LayoutDoc } from "../model/layout.ts";
import { inferScreen } from "../analysis/infer.ts";
import { emitSwift, SWIFT_RUNTIME } from "../swift/emit.ts";
import { extractTokens, emitDesignTokens, screenTokens } from "../swift/tokens.ts";
import { validateName } from "./naming.ts";
import type { CompileOptions, CompileResult } from "./index.ts";
import { GEOMETRY_RUNTIME } from "../swift/geometry-runtime.ts";
import { TEXT_OBSERVATION_RUNTIME } from "../swift/text-observation-runtime.ts";
import { TEXT_OBSERVED_GREEDY_RUNTIME } from "../swift/text-observed-greedy-runtime.ts";

export interface CompileLayoutInput extends CompileOptions {
  layout: LayoutDoc;
  /** Every view in the target needs a distinct Swift type and output filename. */
  name: string;
  /** Shared identity for light/dark captures of one component; defaults to the view name. */
  componentId?: string;
  /** Additional generated sources, such as Font+Markswift.swift or a plist fragment. */
  supportFiles?: Record<string, string>;
  /** Binary resources, such as packaged font files under Fonts/. */
  assets?: Record<string, Uint8Array>;
}

export interface CompileBatchResult {
  /** One Swift file per view, plus one runtime, token file and shape file. */
  files: Record<string, string>;
  /** Deduplicated binary resources for the same Swift target. */
  assets: Record<string, Uint8Array>;
  views: Array<Omit<CompileResult, "files">>;
}

/**
 * A shared color-token pass keeps distinct views from defining the same Swift token name with
 * different values. Font packaging stays with the caller, as it does for compileLayout; supplied
 * support files and assets are deduplicated only when their names and contents agree exactly.
 */
export function compileLayouts(inputs: readonly CompileLayoutInput[]): CompileBatchResult {
  if (!inputs.length) throw new Error("compileLayouts requires at least one layout");
  const names = new Set<string>();
  const componentThemes = new Map<string, Set<string>>();
  const prepared = inputs.map((input) => {
    validateName(input.name);
    const folded = input.name.toLowerCase();
    if (names.has(folded)) throw new Error(`Duplicate view name: ${input.name}`);
    names.add(folded);
    const doc = LayoutDoc.parse(input.layout);
    const componentId = input.componentId ?? input.name;
    if (typeof componentId !== "string" || !componentId.trim()) throw new Error("componentId must be a non-empty string");
    const themes = componentThemes.get(componentId) ?? new Set<string>();
    if (themes.has(doc.combo.theme)) throw new Error(`Duplicate component theme: ${componentId} (${doc.combo.theme})`);
    themes.add(doc.combo.theme);
    componentThemes.set(componentId, themes);
    // Distinct components have isolated token lookups, while explicit light/dark captures of
    // one component share a screen base so matching nodes can become semantic color tokens.
    const screen = inferScreen(doc, `${componentId}-${doc.combo.theme}`, { bundledFamilies: input.bundledFamilies });
    return { input, screen };
  });
  const tokens = extractTokens(prepared.map(({ screen }) => screen));
  const files: Record<string, string> = {};
  const assets: Record<string, Uint8Array> = {};
  const occupied = new Map<string, { name: string; kind: "file" | "asset" }>();
  const add = (name: string, contents: string | Uint8Array, kind: "file" | "asset", label: string) => {
    safePath(name);
    const key = name.toLowerCase();
    const previous = occupied.get(key);
    if (previous) {
      if (previous.name !== name) throw new Error(`Case-insensitive output path collision: ${previous.name} and ${name}`);
      if (previous.kind !== kind) throw new Error(`Conflicting ${label}: ${name} is already a ${previous.kind}`);
      if (kind === "file" && files[name] === contents) return;
      if (kind === "asset" && equalBytes(assets[name]!, contents as Uint8Array)) return;
      throw new Error(`Conflicting ${label}: ${name}`);
    }
    const segments = key.split("/");
    for (let count = 1; count < segments.length; count++) {
      const ancestor = occupied.get(segments.slice(0, count).join("/"));
      if (ancestor) throw new Error(`Output path collision (file/directory): ${ancestor.name} and ${name}`);
    }
    for (const [path, descendant] of occupied) {
      if (path.startsWith(`${key}/`)) throw new Error(`Output path collision (file/directory): ${name} and ${descendant.name}`);
    }
    occupied.set(key, { name, kind });
    if (kind === "file") {
      if (typeof contents !== "string") throw new Error(`Support file must contain text: ${name}`);
      files[name] = contents;
    } else {
      if (!(contents instanceof Uint8Array)) throw new Error(`Asset must contain bytes: ${name}`);
      assets[name] = new Uint8Array(contents);
    }
  };

  const shapes: Record<string, string> = {};
  const views: CompileBatchResult["views"] = [];
  for (const { input, screen } of prepared) {
    const result = emitSwift(screen, input.name, {
      mode: input.mode ?? "app", tokens: screenTokens(tokens, screen), fontMetrics: input.fontMetrics,
      geometryInstrumentation: input.geometryInstrumentation,
      textInstrumentation: input.textInstrumentation,
    });
    views.push({ name: input.name, code: result.view, diagnostics: result.report, mapping: result.mapping, ...(result.geometry ? { geometry: result.geometry } : {}), ...(result.text ? { text: result.text } : {}) });
    if (result.geometry) add("MarkswiftGeometry.swift", GEOMETRY_RUNTIME, "file", "geometry runtime");
    if (result.text) add("MarkswiftTextObservation.swift", TEXT_OBSERVATION_RUNTIME + TEXT_OBSERVED_GREEDY_RUNTIME, "file", "text observation runtime");
    add(`${input.name}.swift`, result.view, "file", "view file");
    for (const [name, source] of Object.entries(result.shapes)) {
      if (shapes[name] !== undefined && shapes[name] !== source) throw new Error(`Conflicting shape definition: ${name}`);
      shapes[name] = source;
    }
  }
  add("MarkswiftRuntime.swift", SWIFT_RUNTIME, "file", "runtime file");
  add("MarkswiftTokens.swift", emitDesignTokens(tokens), "file", "token file");
  add("MarkswiftShapes.swift", "// Generated by Markswift — SVG paths as Shapes.\nimport SwiftUI\n\n" + Object.keys(shapes).sort().map((key) => shapes[key]).join("\n"), "file", "shape file");
  for (const { input } of prepared) {
    for (const [name, source] of Object.entries(input.supportFiles ?? {})) add(name, source, "file", "support file");
    for (const [name, bytes] of Object.entries(input.assets ?? {})) add(name, bytes, "asset", "asset");
  }
  return { files, assets, views };
}

function safePath(name: string): void {
  if (!name || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("\\") || name.includes("\0") ||
      name.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Unsafe output path: ${name}`);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
