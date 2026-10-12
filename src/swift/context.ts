import type { Color } from "../model/values.ts";
import type { Confidence, Diagnostic, Screen, SemNode, Style } from "../model/semantic.ts";
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
  /** Repeated-sibling extraction (app mode). `false` only for the pixel-identity check; default on. */
  extract?: boolean;
  /** `public` for a generated library (plan 033's `build`); `convert` stays internal. Default `internal`. */
  visibility?: "internal" | "public";
  /** Previews call `BundledFonts.register()` first: the library package bundles fonts (plan 033's `build`). */
  registerFonts?: boolean;
  /** Command the view header names for regeneration. Default `convert`. */
  regenerate?: "convert" | "build";
}

/** Everything the recursive emitters need; built once per screen. */
export interface EmitContext extends ColorCtx {
  /** Recursive child lines; supplied by the screen emitter. */
  renderNode: (node: SemNode) => string[];
  fontMetrics: FontMetrics;
  /** Container node → Swift property name. */
  nameOf: Map<SemNode, string>;
  /**
   * Items of native rows, grids and content-sized containers: CSS sizes them no narrower than
   * their content (`min-width: auto` of flex/grid items, shrink-to-fit), so their fill frames
   * may grow to it. Every other fill-width box takes its container's width; see `frameModifier`.
   */
  contentMinWidth: Set<SemNode>;
  /**
   * App mode: children whose size a runtime Layout allocates (MarkswiftTracks cells; MarkswiftFlexRow items in plan 037).
   * "width": accept the proposed width; "both": also the proposed height (grid stretch).
   */
  allocated: Map<SemNode, "width" | "both">;
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
  /** True when the colour `id` paints is opaque in every theme this view renders (a semantic token checks its dark value too). */
  opaque(c: Color, id: string | undefined): boolean;
}

/** How one node paints in an interaction state, on top of its resting look (`states.ts` `pairStyle`). */
export interface StatePaint {
  /** The owner's member name (`isSavePressed`, `isEmailFocused`): the ternaries' condition. */
  cond: string;
  /** The style the box is emitted with: rest geometry plus anything only the state paints. */
  style: Style;
  /** Keyed by `colorArgs(c)` of the colour the emitter will be asked for, or by a run slot `run<i>`. */
  colors: Map<string, { rest: Color; state: Color }>;
  opacity?: { rest: number; state: number };
  scale?: { rest: [number, number]; state: [number, number] };
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
  /** App mode: `@ScaledMetric` font sizes used so far, property name → declaration; emitted once per view. */
  scaledFonts?: Map<string, string>;
  /** Node id → its interaction-state paint; `colorExpr` turns a paired colour into a ternary. */
  statePaint?: Map<string, StatePaint>;
}

/** The view-level members a screen's controls need, in emission order. */
export interface ControlMembers {
  /** `@State` / callback declarations to put before `var body`. Empty when the screen has none. */
  decls: string[];
  /**
   * Every member in emission order; `value` = design state (`@State private`), `action` =
   * `on<Name>` callback, `ephemeral` = UI state such as pressed/focused (plan 029). `decls` is
   * `members.flatMap(m => m.decl)`.
   */
  members: Array<{ name: string; kind: "value" | "action" | "ephemeral"; type: string; decl: string[] }>;
  stateOf: Map<SemNode, string>;
  /** `Action.key` → callback member. */
  actionOf: Map<string, string>;
  /** Toggle/radio id → the Swift statement a tap on its `<label>` runs. */
  activate: Map<string, string>;
  /** Grouped radio → its tag in the group's `String` selection (its `stateOf` name). */
  radioTag: Map<SemNode, string>;
  /** Node id → its interaction-state paint (pressed under the nearest Button, focused on a text field). */
  statePaint: Map<string, StatePaint>;
  /** Pressable owner → its `@MarkswiftPressed` member. */
  pressOf: Map<SemNode, string>;
  /** Text field → its `@MarkswiftFocused` member. */
  focusOf: Map<SemNode, string>;
}
