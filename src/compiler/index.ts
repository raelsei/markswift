/** Synchronous compiler. No browser, filesystem, Python or Apple toolchain required. */
import { validateName } from "./naming.ts";
import { LAYOUT_DOC_VERSION, LayoutDoc } from "../model/layout.ts";
import { GENERATED_BY, VERSION } from "../model/version.ts";
import { inferScreen } from "../analysis/infer.ts";
import { emitSwift, SWIFT_RUNTIME, type EmitMode, type SwiftOutput } from "../swift/emit.ts";
import { extractTokens, emitDesignTokens, screenTokens, themeDrift } from "../swift/tokens.ts";
import type { ScreenTokens } from "../swift/context.ts";
import { indent } from "../swift/format.ts";
import type { FaceMetrics, BundledFamily } from "../model/fonts.ts";
export type { Diagnostic, DiagnosticLevel, Confidence } from "../model/semantic.ts";

export interface CompileOptions {
  /** Complete Swift type name, e.g. ProfileCard. ASCII identifiers starting with uppercase. */
  name?: string;
  mode?: EmitMode;
  bundledFamilies?: Record<string, BundledFamily>;
  fontMetrics?: Record<string, FaceMetrics>;
  /**
   * Dark capture of the same screen; `layout` must then be the light one. The view is emitted
   * from the light layout and every colour that differs in dark becomes a `Color.markswift(light:dark:)` token.
   */
  dark?: LayoutDoc;
}

export interface CompileResult {
  name: string;
  code: string;
  /** All Swift sources needed by this view, including shared runtime helpers. */
  files: Record<string, string>;
  diagnostics: SwiftOutput["report"];
  /** Binary resources referenced by the generated Swift (relative bundle path → bytes), e.g. `Images/<hash>.png`. Add these resources to the iOS target. */
  assets: Record<string, Uint8Array>;
  /** Light/dark pairing limitations; empty for a single-theme compile. */
  warnings: string[];
}

/** Compile a captured layout. Custom fonts must be packaged by the caller and passed explicitly. */
export function compileLayout(layout: LayoutDoc, options: CompileOptions = {}): CompileResult {
  const name = options.name ?? "ConvertedView";
  validateName(name);
  for (const d of [layout, options.dark]) {
    const version = (d as { version?: unknown } | undefined)?.version;
    if (d && version !== LAYOUT_DOC_VERSION)
      throw new Error(
        `LayoutDoc version ${String(version)} cannot be compiled by Markswift ${VERSION}, which reads LayoutDoc version ${LAYOUT_DOC_VERSION}; capture the source again.`,
      );
  }
  const doc = LayoutDoc.parse(layout);
  const darkDoc = options.dark && LayoutDoc.parse(options.dark);
  if (
    darkDoc &&
    (doc.combo.theme !== "light" || darkDoc.combo.theme !== "dark" || doc.combo.screen !== darkDoc.combo.screen)
  ) {
    throw new Error("options.dark must be the dark capture of the same screen as a light layout");
  }
  const infer = (d: LayoutDoc) =>
    inferScreen(d, `${d.combo.screen}-${d.combo.theme}`, { bundledFamilies: options.bundledFamilies });
  const screen = infer(doc);
  const dark = darkDoc && infer(darkDoc);
  const tokens = extractTokens(dark ? [screen, dark] : [screen]);
  const lookup = screenTokens(tokens, screen);
  // Adaptive: record what the emitter painted per node — bound tokens and literal misses — to
  // catch a colour that changes in dark yet was painted as a light literal.
  const bound = new Set<string>();
  const missed = new Set<string>();
  const tracked: ScreenTokens = {
    name: (c, id, slot) => {
      const token = lookup.name(c, id, slot);
      if (token) bound.add(`${id}\u0000${token}`);
      else missed.add(`${id}\u0000${c.r},${c.g},${c.b},${c.a}`);
      return token;
    },
  };
  const result = emitSwift(screen, name, {
    mode: options.mode ?? "app",
    tokens: dark ? tracked : lookup,
    fontMetrics: options.fontMetrics,
    adaptive: !!dark,
  });
  const warnings: string[] = [];
  if (dark) {
    const sample = (ids: string[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? ", …" : "");
    const drift = themeDrift(screen, dark);
    if (drift.length) {
      warnings.push(
        `adaptive: ${drift.length} node(s) differ between the light and dark captures beyond colour (present in one theme only, different colour slots, or geometry moved more than 0.5px); the view keeps their light values: ${sample(drift)}`,
      );
    }
    const unbound = new Set<string>();
    for (const t of tokens.tokens) {
      if (t.kind !== "semantic") continue;
      const light = `${t.light.r},${t.light.g},${t.light.b},${t.light.a}`;
      for (const id of t.uses)
        if (!bound.has(`${id}\u0000${t.name}`) && missed.has(`${id}\u0000${light}`)) unbound.add(id);
    }
    if (unbound.size) {
      warnings.push(
        `adaptive: ${unbound.size} node(s) paint a colour that changes in dark but could not be bound to an adaptive token (the same light colour pairs with two dark colours on the node); the view keeps the light colour: ${sample([...unbound])}`,
      );
    }
  }
  const shapes = Object.keys(result.shapes)
    .sort()
    .map((key) => result.shapes[key]);
  return {
    name,
    code: result.view,
    diagnostics: result.report,
    warnings,
    assets: result.images,
    files: {
      [`${name}.swift`]: result.view,
      "MarkswiftRuntime.swift": SWIFT_RUNTIME,
      [`${name}+Tokens.swift`]: emitDesignTokens(tokens, name, !!dark),
      ...(shapes.length
        ? {
            [`${name}+Shapes.swift`]: `// ${GENERATED_BY} — SVG paths and clip polygons as Shapes.\nimport SwiftUI\n\nextension ${name} {\n${indent(shapes.join("\n").trimEnd().split("\n"), 1).join("\n")}\n}\n`,
          }
        : {}),
    },
  };
}

export type { LayoutDoc } from "../model/layout.ts";
export type { EmitMode } from "../swift/emit.ts";
