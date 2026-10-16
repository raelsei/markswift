/** Synchronous compiler. No browser, filesystem, Python or Apple toolchain required. */
import { validateName } from "./naming.ts";
import { isDeepStrictEqual } from "node:util";
import { LAYOUT_DOC_VERSION, LayoutDoc, type LayoutNode } from "../model/layout.ts";
import { GENERATED_BY, VERSION } from "../model/version.ts";
import { inferScreen } from "../analysis/infer.ts";
import { applyLayers } from "../analysis/layers.ts";
import { admitTracks } from "../analysis/grid-tracks.ts";
import { admitFlexRow } from "../analysis/flex-row.ts";
import { bandEdges, mergeBands } from "../analysis/breakpoints.ts";
import { bandNames } from "../analysis/bands.ts";
import { isTooltipLayer } from "../analysis/tooltips.ts";
import { note } from "../swift/diagnostics.ts";
import { visit } from "../swift/traversal.ts";
import { emitSwift, SWIFT_RUNTIME, type EmitMode, type EmitOptions, type SwiftOutput } from "../swift/emit.ts";
import {
  extractTokens,
  emitDesignTokens,
  pairUsages,
  paletteWarnings,
  screenBase,
  screenTokens,
  themeDrift,
  type PaletteMap,
  type TokenSet,
} from "../swift/tokens.ts";
import type { ScreenTokens } from "../swift/context.ts";
import { indent } from "../swift/format.ts";
import type { FaceMetrics, BundledFamily } from "../model/fonts.ts";
import type { ConversionWarning, Screen, SemNode } from "../model/semantic.ts";
import type { Color } from "../model/values.ts";
export type { Diagnostic, DiagnosticLevel, Confidence, ConversionWarning } from "../model/semantic.ts";

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
  /**
   * Capture of the same screen and theme at another viewport width. Admitted MarkswiftTracks/MarkswiftFlexRow nodes
   * whose authored inputs do not reproduce the probe geometry within 1px fall back to pinned output with a diagnostic.
   */
  probe?: LayoutDoc;
  /** Breakpoint conversion: captures of the same screen and theme at the other width bands, ascending by viewport
   * width; `layout` is band 0. Their shared `conditions` define the band edges. */
  variants?: LayoutDoc[];
  /** Dark captures of `variants`, same order; required when `dark` is set with `variants`. */
  darkVariants?: LayoutDoc[];
  /** Probe capture per variant (same order), as `probe` is for `layout`. */
  variantProbes?: Array<LayoutDoc | undefined>;
  /** @internal Pixel-identity check only: disables repeated-sibling extraction. */
  extract?: boolean;
  /** `public` for a generated library (plan 033's `build`); `convert` stays internal. Default `internal`. */
  visibility?: "internal" | "public";
  /** App colours for captured tokens (`--palette`); views keep referencing `Palette.x`. */
  palette?: PaletteMap;
}

export interface CompileResult {
  name: string;
  code: string;
  /** All Swift sources needed by this view, including shared runtime helpers. */
  files: Record<string, string>;
  diagnostics: SwiftOutput["report"];
  /** Binary resources referenced by the generated Swift (relative bundle path → bytes), e.g. `Images/<hash>.png`. Add these resources to the iOS target. */
  assets: Record<string, Uint8Array>;
  /** Light/dark pairing limitations and palette-map gaps; empty for a single-theme compile without a map. */
  warnings: ConversionWarning[];
  /** App mode: layer id → the `init` label (`isMoreExpanded`, `isEditProfilePresented`) that shows it; absent when nothing opens. */
  openStates?: Record<string, string>;
}

type ComponentDocs = Pick<CompileOptions, "dark" | "probe" | "variants" | "darkVariants" | "variantProbes">;
type BandScreens = Array<[Screen, Screen | undefined]>;

/**
 * One component's screen(s): merged across bands when `variants` differ, else the single capture. Screens are named
 * `${name}-${theme}` and band `b` `${name}@${b}-${theme}`; `name` defaults to the capture's screen.
 */
function componentScreens(
  name: string | undefined,
  layout: LayoutDoc,
  c: ComponentDocs,
  mode: EmitMode,
  bundledFamilies: CompileOptions["bundledFamilies"],
): { screen: Screen; dark?: Screen; bands?: BandScreens; warnings: ConversionWarning[] } {
  const [doc, darkDoc, probeDoc] = parseDocs(layout, c.dark, c.probe);
  const variants = parseVariants(doc, darkDoc, c);
  const base = name ?? doc.combo.screen;
  const infer = (d: LayoutDoc, band = 0) =>
    inferScreen(d, `${base}${band ? `@${band}` : ""}-${d.combo.theme}`, { bundledFamilies });
  // App: closed in-flow layers join the screen before probe checks and tokens see it.
  const layered = (d: LayoutDoc) => {
    const s = infer(d);
    if (mode === "app") applyLayers(s, d, { bundledFamilies });
    return s;
  };
  const single = (warnings: ConversionWarning[]) => {
    const screen = layered(doc);
    if (probeDoc) verifyAtProbe(screen, probeDoc);
    return { screen, ...(darkDoc ? { dark: layered(darkDoc) } : {}), warnings };
  };
  if (!variants.length) return single([]);
  const docs = [doc, ...variants.map((v) => v.layout)];
  const edges = bandEdges(docs);
  if ("warning" in edges)
    return single([{ source: "breakpoints", level: "approximated", feature: "media-query", message: edges.warning }]);
  const screens = docs.map((d, b) => {
    const s = infer(d, b);
    const probe = b ? variants[b - 1]!.probe : probeDoc;
    if (probe) verifyAtProbe(s, probe);
    return s;
  });
  const merged = mergeBands(docs, screens);
  // No element differs between bands: band 0 compiles alone, exactly as without variants.
  if (!merged) return single([]);
  const dark = darkDoc && infer(darkDoc);
  const screen: Screen = {
    ...screens[0]!,
    root: merged.root,
    breakpoints: {
      edges: edges.edges,
      cssEdges: edges.cssEdges,
      widths: docs.map((d) => d.viewport.w),
      names: bandNames(edges.cssEdges),
    },
  };
  const warnings = [...merged.warnings];
  // App: band 0's layers (bands > 0 are captured without them), once on the merged screen. A layer whose trigger or
  // parent sits in a holder alternative differs between bands, so it is reported instead.
  if (mode === "app") {
    const inAlt = new Set<string>();
    visit(merged.root, (n) => {
      if (n.alternatives) visit(n, (m) => inAlt.add(m.id));
    });
    const dropped = new Set<string>();
    for (const l of doc.layers ?? [])
      if (!isTooltipLayer(l, doc.root) && (inAlt.has(l.trigger) || (l.parent !== undefined && inAlt.has(l.parent)))) {
        dropped.add(l.id);
        warnings.push({
          source: "breakpoints",
          level: "approximated",
          feature: "media-query",
          message: `layer ${l.id} is not emitted inside a breakpoint alternative (its trigger or parent differs between width bands)`,
        });
      }
    const kept = (d: LayoutDoc): LayoutDoc => ({ ...d, layers: d.layers?.filter((l) => !dropped.has(l.id)) });
    applyLayers(screen, kept(doc), { bundledFamilies });
    if (dark && darkDoc) applyLayers(dark, kept(darkDoc), { bundledFamilies });
  }
  // Tokens pair band 0's light screen — the merged root as band 0 shows it, layer content included — with its dark.
  const bands: BandScreens = screens.map((s, b) => [
    b ? s : { ...s, root: bandRoot(screen.root, 0) },
    b ? variants[b - 1]!.dark && infer(variants[b - 1]!.dark!, b) : dark,
  ]);
  return { screen, ...(dark ? { dark } : {}), bands, warnings };
}

/** `n` as band `b` shows it: every holder replaced, recursively, by its member whose `bands` hold `b`. */
function bandRoot(n: SemNode, b: number): SemNode {
  const member = n.alternatives?.find((a) => a.bands!.includes(b));
  if (member) return bandRoot(member, b);
  const at = (c: SemNode) => bandRoot(c, b);
  const overlays = n.overlays.map((o) => ({ ...o, node: at(o.node) }));
  if (n.kind === "stack" || n.kind === "grid") return { ...n, overlays, children: n.children.map(at) };
  if (n.kind === "control")
    return { ...n, overlays, ...(n.label ? { label: at(n.label) } : {}), content: n.content.map(at) };
  return { ...n, overlays };
}

/** The screens one view's tokens come from: every band pair, else the light screen and its dark. */
function tokenScreens(screen: Screen, dark: Screen | undefined, bands: BandScreens | undefined): Screen[] {
  return bands ? bands.flatMap(([light, d]) => (d ? [light, d] : [light])) : dark ? [screen, dark] : [screen];
}

/** Compile a captured layout. Custom fonts must be packaged by the caller and passed explicitly. */
export function compileLayout(layout: LayoutDoc, options: CompileOptions = {}): CompileResult {
  const name = options.name ?? "ConvertedView";
  validateName(name);
  const mode = options.mode ?? "app";
  const { screen, dark, bands, warnings } = componentScreens(undefined, layout, options, mode, options.bundledFamilies);
  const tokens = extractTokens(tokenScreens(screen, dark, bands));
  const result = compileView(
    screen,
    dark,
    name,
    tokens,
    {
      mode,
      fontMetrics: options.fontMetrics,
      extract: options.extract,
      visibility: options.visibility,
    },
    bands,
  );
  warnings.push(...result.warnings);
  if (options.palette) warnings.push(...paletteWarnings(tokens, options.palette));
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
      [`${name}+Tokens.swift`]: emitDesignTokens(tokens, name, { adaptive: !!dark, palette: options.palette }),
      ...(shapes.length
        ? {
            [`${name}+Shapes.swift`]: `// ${GENERATED_BY} — SVG paths and clip polygons as Shapes.\nimport SwiftUI\n\nextension ${name} {\n${indent(shapes.join("\n").trimEnd().split("\n"), 1).join("\n")}\n}\n`,
          }
        : {}),
    },
    ...(result.openStates ? { openStates: result.openStates } : {}),
  };
}

/** Version-check and parse a light layout, its optional dark capture and its optional probe capture. */
function parseDocs(
  layout: LayoutDoc,
  dark: LayoutDoc | undefined,
  probe?: LayoutDoc,
): [LayoutDoc, LayoutDoc | undefined, LayoutDoc | undefined] {
  for (const d of [layout, dark, probe]) {
    const version = (d as { version?: unknown } | undefined)?.version;
    if (d && version !== LAYOUT_DOC_VERSION)
      throw new Error(
        `LayoutDoc version ${String(version)} cannot be compiled by Markswift ${VERSION}, which reads LayoutDoc version ${LAYOUT_DOC_VERSION}; capture the source again.`,
      );
  }
  const doc = LayoutDoc.parse(layout);
  const darkDoc = dark && LayoutDoc.parse(dark);
  if (
    darkDoc &&
    (doc.combo.theme !== "light" || darkDoc.combo.theme !== "dark" || doc.combo.screen !== darkDoc.combo.screen)
  ) {
    throw new Error("options.dark must be the dark capture of the same screen as a light layout");
  }
  const probeDoc = probe && LayoutDoc.parse(probe);
  if (
    probeDoc &&
    (probeDoc.combo.screen !== doc.combo.screen ||
      probeDoc.combo.theme !== doc.combo.theme ||
      probeDoc.size.w === doc.size.w)
  ) {
    throw new Error("options.probe must be a capture of the same screen and theme at another width");
  }
  return [doc, darkDoc, probeDoc];
}

/** Each width-band variant parsed like `layout` (with its dark and probe captures), checked against band 0. */
function parseVariants(
  doc: LayoutDoc,
  darkDoc: LayoutDoc | undefined,
  options: ComponentDocs,
): Array<{ layout: LayoutDoc; dark?: LayoutDoc; probe?: LayoutDoc }> {
  const variants = options.variants ?? [];
  if ((options.darkVariants?.length ?? 0) !== (darkDoc ? variants.length : 0))
    throw new Error("options.darkVariants must hold one dark capture per variant, exactly when options.dark is set");
  if ((options.variantProbes?.length ?? 0) > variants.length)
    throw new Error("options.variantProbes must hold at most one probe per variant");
  let width = doc.viewport.w;
  return variants.map((v, i) => {
    let layout: LayoutDoc, dark: LayoutDoc | undefined, probe: LayoutDoc | undefined;
    try {
      [layout, dark, probe] = parseDocs(v, options.darkVariants?.[i], options.variantProbes?.[i]);
    } catch (error) {
      throw new Error(`options.variants[${i}]: ${(error as Error).message}`, { cause: error });
    }
    if (
      layout.combo.screen !== doc.combo.screen ||
      layout.combo.theme !== doc.combo.theme ||
      layout.viewport.w <= width
    )
      throw new Error(
        "options.variants must be captures of the screen and theme of layout at ascending viewport widths",
      );
    width = layout.viewport.w;
    return { layout, ...(dark ? { dark } : {}), ...(probe ? { probe } : {}) };
  });
}

function walk(n: LayoutNode, fn: (n: LayoutNode) => void): void {
  fn(n);
  for (const c of n.children) walk(c, fn);
}

/** A runtime Layout (MarkswiftTracks, MarkswiftFlexRow) would reflow some node of `layout`: a probe capture can verify it. */
export function needsProbe(layout: LayoutDoc): boolean {
  let found = false;
  walk(LayoutDoc.parse(layout).root, (n) => {
    found ||= admitTracks(n) !== undefined || admitFlexRow(n) !== undefined;
  });
  return found;
}

export { planBands, BAND_MIN, BAND_CAP, DEFAULT_BAND_DEVICES, type BandPlan } from "../analysis/bands.ts";

/** Demotes admitted layouts whose authored inputs do not reproduce the probe capture (same node id) within 1px. */
function verifyAtProbe(screen: Screen, probe: LayoutDoc): void {
  const byId = new Map<string, LayoutNode>();
  walk(probe.root, (n) => {
    if (n.id !== undefined) byId.set(n.id, n);
  });
  visit(screen.root, (n) => {
    const at = n.id ? byId.get(n.id) : undefined;
    if (n.kind === "grid" && n.template) {
      const t = n.template;
      const p = at && admitTracks(at);
      // Auto-repeat placement is row-major over a width-dependent column count: compare no placements there.
      const same =
        p &&
        isDeepStrictEqual(
          [
            p.template.tracks,
            p.template.autoRepeat,
            p.stretch,
            p.rows,
            p.autoRow,
            p.template.autoRepeat ? [] : p.placements,
          ],
          [
            t.tracks,
            t.autoRepeat,
            t.stretch,
            t.rows,
            t.autoRow,
            t.autoRepeat ? [] : t.items.map(({ child: _c, margin: _m, ...place }) => place),
          ],
        );
      if (same) return;
      delete n.template;
      note(n, "approximated", n.measured ? "display: grid" : "grid-template-columns", t.fidelityNote);
    } else if (n.kind === "stack" && n.flex) {
      const f = n.flex;
      const p = at && admitFlexRow(at, true);
      if (p && isDeepStrictEqual([p.items, p.align], [f.items, f.align])) return;
      delete n.flex;
      note(
        n,
        "approximated",
        f.fidelityNote?.feature ?? "flex-shrink",
        `flex allocation not reproduced at the ${probe.size.w}px probe; captured widths pinned`,
      );
    }
  });
}

const colorKey = (c: Color) => `${c.r},${c.g},${c.b},${c.a}`;

/**
 * One view against a token set that may span many screens; adaptive warnings cover this view only. `bands`: the
 * light/dark band screens a breakpoint view was merged from; tokens resolve against each band, lowest first.
 */
function compileView(
  screen: Screen,
  dark: Screen | undefined,
  name: string,
  tokens: TokenSet,
  options: Omit<EmitOptions, "tokens" | "adaptive">,
  bands?: Array<[Screen, Screen | undefined]>,
): SwiftOutput & { warnings: ConversionWarning[] } {
  if (dark && dark.colorScheme !== screen.colorScheme) delete screen.colorScheme; // an adaptive pair forces a scheme only when both captures do
  const lookup = screenTokens(
    tokens,
    screen,
    bands?.map(([light]) => screenBase(light)),
  );
  // Adaptive: record what the emitter painted per node — bound tokens and literal misses — to
  // catch a colour that changes in dark yet was painted as a light literal.
  const bound = new Set<string>();
  const missed = new Set<string>();
  const tracked: ScreenTokens = {
    name: (c, id, slot) => {
      const token = lookup.name(c, id, slot);
      if (token) bound.add(`${id}\u0000${token}`);
      else missed.add(`${id}\u0000${colorKey(c)}`);
      return token;
    },
    opaque: (c, id) => lookup.opaque(c, id),
  };
  const result = emitSwift(screen, name, { ...options, tokens: dark ? tracked : lookup, adaptive: !!dark });
  const warnings: ConversionWarning[] = [];
  if (dark) {
    const sample = (ids: string[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? ", …" : "");
    const drift = bands
      ? [...new Set(bands.flatMap(([light, d]) => (d ? themeDrift(light, d) : [])))]
      : themeDrift(screen, dark);
    if (drift.length) {
      warnings.push({
        source: "adaptive",
        level: "approximated",
        feature: "color-scheme",
        message: `${drift.length} node(s) differ between the light and dark captures beyond colour (present in one theme only, different colour slots, or geometry moved more than 0.5px); the view keeps their light values: ${sample(drift)}`,
      });
    }
    // Node ids repeat across screens, so this view's own usages are paired, never a token's `uses`.
    const pairName = new Map<string, string>();
    for (const t of tokens.tokens)
      if (t.kind === "semantic") pairName.set(`${colorKey(t.light)}|${colorKey(t.dark)}`, t.name);
    const hits = new Map<string, string[]>();
    for (const u of pairUsages(tokenScreens(screen, dark, bands))) {
      const light = colorKey(u.light);
      const pair = u.dark && light !== colorKey(u.dark) ? pairName.get(`${light}|${colorKey(u.dark)}`) : undefined;
      if (pair && !bound.has(`${u.nodeId}\u0000${pair}`) && missed.has(`${u.nodeId}\u0000${light}`)) {
        const ids = hits.get(pair);
        if (ids) ids.push(u.nodeId);
        else hits.set(pair, [u.nodeId]);
      }
    }
    // Token order, then document order: the sample lists nodes as one screen's token walk did.
    const unbound = new Set(tokens.tokens.flatMap((t) => hits.get(t.name) ?? []));
    if (unbound.size) {
      warnings.push({
        source: "adaptive",
        level: "approximated",
        feature: "color-scheme",
        message: `${unbound.size} node(s) paint a colour that changes in dark but could not be bound to an adaptive token (the same light colour pairs with two dark colours on the node); the view keeps the light colour: ${sample([...unbound])}`,
      });
    }
  }
  return { ...result, warnings };
}

export interface LibraryComponent {
  name: string;
  layout: LayoutDoc;
  dark?: LayoutDoc;
  /** Breakpoint component: captures at the other width bands, as `CompileOptions.variants`. */
  variants?: LayoutDoc[];
  /** Dark captures of `variants`, as `CompileOptions.darkVariants`. */
  darkVariants?: LayoutDoc[];
  mode?: EmitMode;
}

export interface LibraryOptions extends Pick<CompileOptions, "bundledFamilies" | "fontMetrics" | "palette"> {
  /** Library (Swift module) name; must differ from every component name. */
  library: string;
  /** Add `BundledFonts.register()` to every preview (the package bundles fonts). */
  registerFonts?: boolean;
}

export interface LibraryResult {
  /** Module sources, relative to `Sources/<library>/`. */
  files: Record<string, string>;
  assets: Record<string, Uint8Array>;
  /** Per-component compile warnings, each with `component` set to the component name; palette-map warnings are library-wide. */
  warnings: ConversionWarning[];
  diagnostics: Record<string, CompileResult["diagnostics"]>;
}

/** Library and component names of one build: valid Swift types, unique ignoring case, none named like the library. */
export function validateLibrary(library: string, components: string[]): void {
  const check = (what: string, name: string) => {
    try {
      validateName(name);
    } catch (error) {
      throw new Error(`${what} "${name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  check("library", library);
  if (!components.length) throw new Error("a library needs at least one component");
  const seen = new Set([library.toLowerCase()]);
  for (const name of components) {
    check("component", name);
    if (name.toLowerCase() === library.toLowerCase())
      throw new Error(`component "${name}" is named like the library ${library}`);
    if (seen.has(name.toLowerCase())) throw new Error(`duplicate component name "${name}" (names ignore case)`);
    seen.add(name.toLowerCase());
  }
}

/**
 * Compile many captured components into the sources of one Swift module: one token set over every
 * screen, so one name per light/dark value pair, emitted as a module-level `public enum Palette`
 * (`MarkswiftPalette.swift`); shapes deduplicated into `MarkswiftShapes.swift`; one runtime;
 * public views. Views reference bare `Palette.x`/`MarkswiftShape_x`, which resolve to these.
 */
export function compileLayouts(components: LibraryComponent[], options: LibraryOptions): LibraryResult {
  validateLibrary(
    options.library,
    components.map((c) => c.name),
  );
  const screens = components.map((c) => ({
    c,
    ...componentScreens(c.name, c.layout, c, c.mode ?? "app", options.bundledFamilies),
  }));
  const tokens = extractTokens(screens.flatMap((s) => tokenScreens(s.screen, s.dark, s.bands)));
  const files: Record<string, string> = {};
  const shapes: Record<string, string> = {};
  const assets: Record<string, Uint8Array> = {};
  const warnings: ConversionWarning[] = [];
  const diagnostics: LibraryResult["diagnostics"] = {};
  for (const { c, screen, dark, bands, warnings: own } of screens) {
    const result = compileView(
      screen,
      dark,
      c.name,
      tokens,
      {
        mode: c.mode ?? "app",
        fontMetrics: options.fontMetrics,
        visibility: "public",
        registerFonts: options.registerFonts,
        regenerate: "build",
      },
      bands,
    );
    files[`${c.name}.swift`] = result.view;
    for (const [key, text] of Object.entries(result.shapes)) {
      if (shapes[key] !== undefined && shapes[key] !== text) throw new Error(`shape ${key} has two definitions`);
      shapes[key] = text;
    }
    for (const [path, bytes] of Object.entries(result.images)) {
      const cur = assets[path];
      if (cur && (cur.length !== bytes.length || cur.some((b, i) => b !== bytes[i])))
        throw new Error(`image ${path} has two different contents`);
      assets[path] = bytes;
    }
    warnings.push(...[...own, ...result.warnings].map((w) => ({ ...w, component: c.name })));
    diagnostics[c.name] = result.report;
  }
  files["MarkswiftPalette.swift"] = emitDesignTokens(tokens, undefined, {
    adaptive: screens.some((s) => s.dark),
    visibility: "public",
    palette: options.palette,
  });
  if (options.palette) warnings.push(...paletteWarnings(tokens, options.palette));
  const shapeKeys = Object.keys(shapes).sort();
  if (shapeKeys.length)
    files["MarkswiftShapes.swift"] =
      `// ${GENERATED_BY} — SVG paths and clip polygons as Shapes.\nimport SwiftUI\n\n${shapeKeys
        .map((k) => shapes[k])
        .join("\n")
        .trimEnd()}\n`;
  files["MarkswiftRuntime.swift"] = SWIFT_RUNTIME;
  return { files, assets, warnings, diagnostics };
}

export type { LayoutDoc } from "../model/layout.ts";
export type { EmitMode } from "../swift/emit.ts";
export type { PaletteMap } from "../swift/tokens.ts";
