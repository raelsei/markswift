import type { Color } from "../css/index.ts";
import type { Confidence, Diagnostic, Screen, SemNode } from "../model/semantic.ts";
import type { FontMetrics } from "../model/fonts.ts";
export interface SwiftOutput {
  /** <Name>View.generated.swift */
  view: string;
  /** Shapes referenced by this screen: name → Swift struct source. */
  shapes: Record<string, string>;
  /** Raster files referenced by this screen: bundle path (`Images/<hash>.<ext>`) → bytes. */
  images: Record<string, Uint8Array>;
  /** Nodes whose confidence is not `mapped`, with what each lost. */
  report: Array<{ id: string; kind: string; confidence: Confidence; diagnostics: Diagnostic[] }>;
}

/**
 * `fidelity` reproduces the measured browser layout for pixel verification: clipped fixed root
 * frame, text pinned to its measured line box, geometry-derived cross alignment. `app` is what
 * ships to Xcode: ScrollView, native text metrics, alignment from the IR.
 */
export type EmitMode = "app" | "fidelity";

export interface EmitOptions {
  /** Packaged metrics for this conversion, keyed by lowercase CSS family. */
  fontMetrics?: FontMetrics;
  mode: EmitMode;
  /** Design tokens of the run, bound to this screen; absent = every colour stays a literal. */
  tokens?: ScreenTokens;
  /** The light screen of a light/dark pair: the view must look right in both colour schemes. */
  adaptive?: boolean;
}

/** Everything the recursive emitters need; built once per screen. */
export interface EmitContext {
  /** Recursive child lines; supplied by the screen emitter. */
  renderNode: (node: SemNode) => string[];
  fontMetrics: FontMetrics;
  /** Container node → Swift property name. */
  nameOf: Map<SemNode, string>;
  /** Shape structs referenced so far, name → source. */
  shapes: Record<string, string>;
  /** Raster files referenced so far, path → bytes. */
  images: Record<string, Uint8Array>;
  screen: Screen;
  mode: EmitMode;
  /** `@State` names and action callbacks of this screen's controls. */
  control: ControlMembers;
  /** This screen's colour → token lookup; see `colorExpr`. */
  tokens?: ScreenTokens;
  adaptive?: boolean;
}

/**
 * Resolves a colour one node paints to a design-token name. Implemented by `tokens/extract.ts`
 * (`screenTokens`), which binds the screen and theme being emitted; declared here so the
 * emitters depend on the lookup and not on the extractor.
 */
export interface ScreenTokens {
  /** Token for the colour `id` paints (at `slot`, when the call site knows it), or undefined when the colour must stay a literal. */
  name(c: Color, id: string | undefined, slot?: string): string | undefined;
}

/**
 * The part of an emitter's context a colour or a font needs. `EmitContext` and `ControlDeps` both
 * satisfy it.
 */
export interface ColorCtx {
  /** Absent when the run emits no token file, or for a node whose colours are all literals. */
  tokens?: ScreenTokens;
  /** Which output is being written; `fontExpr` emits a different font expression per mode. */
  mode: EmitMode;
}

/** The view-level members a screen's controls need, in emission order. */
export interface ControlMembers {
  /** `@State` / callback declarations to put before `var body`. Empty when the screen has none. */
  decls: string[];
  stateOf: Map<SemNode, string>;
  actionOf: Map<string, string>;
}
