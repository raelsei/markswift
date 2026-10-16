/** Assemble a screen from cohesive Swift emission modules. */
import type { Screen, SemNode, StackNode, GridNode } from "../model/semantic.ts";
import type { Theme } from "../model/layout.ts";
import { GENERATED_BY } from "../model/version.ts";
import { colorArgs, identifier, indent, num, uniqueName } from "./format.ts";
import { controlMembers } from "./control-state.ts";
import type { EmitContext, EmitOptions, SwiftOutput } from "./context.ts";
import { access, asMember, extractComponents } from "./components.ts";
import { refOf } from "./nodes.ts";
import { bandsOpen, containerExpr } from "./layout.ts";
import { visit } from "./traversal.ts";
export type { EmitMode, EmitOptions, SwiftOutput } from "./context.ts";
export { SWIFT_RUNTIME } from "./runtime.ts";
export function emitSwift(screen: Screen, viewName: string, opts: EmitOptions): SwiftOutput {
  const shapes: Record<string, string> = {};
  const images: Record<string, Uint8Array> = {};
  const report: SwiftOutput["report"] = [];
  const props: Array<{ name: string; node: SemNode }> = [];
  const seen: Record<string, number> = {};

  // Collect container properties depth-first so the body reads top-down.
  const contentMinWidth = new Set<SemNode>();
  const allocated = new Map<SemNode, "width" | "height" | "both">();
  // Breakpoints: a container takes the name of its nearest enclosing alternative's lowest band (`v_split_md`).
  const bandSuffix = new Map<SemNode, string>();
  const names = screen.breakpoints?.names;
  if (names)
    visit(screen.root, (a) => {
      if (a.bands) visit(a, (n) => bandSuffix.set(n, names[a.bands![0]!]!));
    });
  visit(screen.root, (n) => {
    if (n.kind !== "stack" && n.kind !== "grid") return;
    const suffix = bandSuffix.get(n);
    props.push({
      name: uniqueName(`v_${identifier(n.id) || "n" + props.length}${suffix ? `_${suffix}` : ""}`, seen),
      node: n,
    });
    // A measured layout proposes each child its captured box, which already holds CSS's minimum.
    // App mode: MarkswiftTracks proposes each cell its column width and, with stretch, its row
    // height; without stretch it proposes no height, so a filling cell takes its content height
    // (its captured height, measured or not, is dropped either way). px-sized cells keep their frames.
    const tracks = opts.mode === "app" && n.kind === "grid" ? n.template : undefined;
    if ((!n.measured || tracks) && (n.kind === "grid" || n.axis === "h" || n.width.kind === "hug"))
      for (const c of n.children) contentMinWidth.add(c);
    if (tracks)
      for (const it of tracks.items)
        if (!it.fixed) allocated.set(n.children[it.child]!, it.justify === "stretch" ? "both" : "height");
    // App mode: MarkswiftFlexRow proposes each item its allocated width; heights stay as the IR says.
    if (opts.mode === "app" && n.kind === "stack" && n.flex) for (const c of n.children) allocated.set(c, "width");
    // App mode: MarkswiftTable proposes every cell and band its slot; captured heights are the Layout's row floors.
    if (opts.mode === "app" && n.kind === "grid" && n.table) for (const c of n.children) allocated.set(c, "both");
  });
  // Breakpoint holders: an alternative is laid out by the holder's parent, so it takes the holder's flags.
  for (const [n, v] of allocated) for (const a of n.alternatives ?? []) allocated.set(a, v);
  for (const n of contentMinWidth) for (const a of n.alternatives ?? []) contentMinWidth.add(a);
  // Containers whose subtree holds a holder read the band: `func v_x(_ band: Int)`. An app-mode scrolling root hosts
  // `MarkswiftBands` inside its ScrollView (the offset survives a switch) unless a `fixed` overlay, a modifier outside
  // the closure that binds `band`, holds a holder.
  // ponytail: a root that is itself a holder and scrolls loses its scroll offset on a switch (each alternative has its
  // own ScrollView). Hoist the ScrollView out of the alternatives if designs need it.
  const bandParam = new Set<SemNode>();
  let bandsInside: SemNode | undefined;
  if (screen.breakpoints) {
    const holds = new Map<SemNode, boolean>();
    const holdsHolder = (n: SemNode): boolean => {
      const known = holds.get(n);
      if (known !== undefined) return known;
      const inside = [
        ...(n.alternatives ?? []),
        ...n.overlays.map((o) => o.node),
        ...(n.kind === "stack" || n.kind === "grid" ? n.children : []),
        ...(n.kind === "control" ? [...(n.label ? [n.label] : []), ...n.content] : []),
      ];
      let found = !!n.alternatives;
      for (const c of inside) found = holdsHolder(c) || found;
      holds.set(n, found);
      if (found && (n.kind === "stack" || n.kind === "grid")) bandParam.add(n);
      return found;
    };
    const root = screen.root;
    holdsHolder(root);
    if (
      opts.mode === "app" &&
      (root.kind === "stack" || root.kind === "grid") &&
      root.scroll &&
      !root.alternatives &&
      !root.overlays.some((o) => o.fixed && holdsHolder(o.node))
    ) {
      bandsInside = root;
      bandParam.delete(root);
    }
  }
  const nameOf = new Map<SemNode, string>();
  for (const p of props) nameOf.set(p.node, p.name);
  // Control state pass: a control owns its value, so the view that holds it declares the storage.
  const control = controlMembers(screen.root, opts.mode, !!screen.breakpoints);
  const scaledFonts = new Map<string, string>();
  const ctx: EmitContext = {
    fontMetrics: opts.fontMetrics ?? {},
    nameOf,
    contentMinWidth,
    allocated,
    bandParam,
    bandsInside,
    shapes,
    images,
    screen,
    mode: opts.mode,
    control,
    tokens: opts.tokens,
    adaptive: opts.adaptive,
    scaledFonts,
    statePaint: control.statePaint,
    renderNode: (node) => extraction?.call(node) ?? refOf(node, ctx),
  };
  // App mode: repeated siblings become one subview fed by a `ForEach` (`components.ts`).
  const extraction =
    opts.mode === "app" && opts.extract !== false ? extractComponents(screen, ctx, viewName, opts) : undefined;
  const acc = access(opts.visibility);

  const comment = (value: string) => value.replace(/[\r\n\u2028\u2029]/g, " ");
  // Body first: emitting it registers the `@ScaledMetric` font sizes declared above it.
  const top = refOf(screen.root, ctx);
  const wrapped =
    screen.breakpoints && !bandsInside
      ? [`${bandsOpen(screen.breakpoints.edges)} { band in`, ...indent(top, 1), "}"]
      : top;
  const scheme = screen.colorScheme ? [`.environment(\\.colorScheme, .${screen.colorScheme})`] : [];
  const body = [`${acc}var body: some View {`, ...indent([...wrapped, ...scheme], 1), "}"];
  for (const p of props) {
    if (extraction?.absorbed.has(p.node)) continue;
    body.push(
      "",
      `// ${comment(p.node.id)}`,
      bandParam.has(p.node)
        ? `private func ${p.name}(_ band: Int) -> some View {`
        : `private var ${p.name}: some View {`,
      ...indent(containerExpr(p.node as StackNode | GridNode, ctx), 1),
      "}",
    );
  }
  // Extraction emitted every node once more for its templates: keep only sizes this view uses.
  const bodyText = extraction ? body.join("\n") : "";
  const scaled = [...scaledFonts]
    .filter(([name]) => !extraction || new RegExp(`\\b${name}\\b`).test(bodyText))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, decl]) => decl);
  // Screen state renamed to an annotated field.
  const renamed = Object.keys(extraction?.rename ?? {});
  if (renamed.length) {
    const re = new RegExp(`\\b(?:${renamed.join("|")})\\b`, "g");
    for (const [i, line] of body.entries()) body[i] = line.replace(re, (m) => extraction!.rename[m]!);
  }
  // Every screen has an explicit `init`: data arrays, annotated fields, then actions, each defaulting to the design.
  const screenMembers = extraction?.members ?? control.members.map(asMember);
  const params = screenMembers.flatMap((m) => (m.param ? [m.param] : []));
  const decls = screenMembers.flatMap(({ decl, param: p }) => [
    ...decl,
    ...(!p
      ? []
      : p.state
        ? [`@State private var ${p.name}: ${p.type}`]
        : [`${acc}var ${p.name}: ${p.type} = ${p.value}`]),
  ]);
  const init = params.length
    ? [
        `${acc}init(${params.map((p) => `${p.name}: ${p.type.includes("->") ? "@escaping " : ""}${p.type} = ${p.value}`).join(", ")}) {`,
        ...params.map((p) =>
          p.state ? `    _${p.name} = State(initialValue: ${p.name})` : `    self.${p.name} = ${p.name}`,
        ),
        "}",
      ]
    : [`${acc}init() {}`];
  const members = [...scaled];
  if (scaled.length) members.push("");
  members.push(...decls);
  if (decls.length) members.push("");
  members.push(...init, "", ...body);
  const preview = (theme: Theme, title: string, args = "", width = screen.size.w) => [
    `#Preview("${title}") {`,
    ...indent(
      [
        ...(opts.registerFonts ? ["BundledFonts.register()", `return ${viewName}(${args})`] : [`${viewName}(${args})`]),
        `.frame(width: ${num(width)}, height: ${num(screen.size.h)})`,
        `.background(Color.markswift(${colorArgs(theme === "dark" ? { r: 0.043, g: 0.055, b: 0.075, a: 1 } : { r: 0.957, g: 0.965, b: 0.98, a: 1 })}))`,
        `.preferredColorScheme(.${theme})`,
      ],
      1,
    ),
    "}",
  ];
  const lines = [
    `// ${GENERATED_BY} — tool-owned: regenerate with \`markswift ${opts.regenerate === "build" ? "build" : "convert --update"}\`; customise through the initializer or your own files. Source: ` +
      comment(screen.source) +
      " (" +
      comment(screen.name) +
      ", " +
      (opts.adaptive ? "light + dark" : screen.theme) +
      ")",
    "import SwiftUI",
    "",
    `${acc}struct ${viewName}: View {`,
    ...indent(members, 1),
    "}",
    "",
    ...(extraction?.extension.length ? [`extension ${viewName} {`, ...indent(extraction.extension, 1), "}", ""] : []),
    ...(opts.adaptive
      ? [...preview("light", `${viewName} — Light`), "", ...preview("dark", `${viewName} — Dark`)]
      : preview(screen.theme, viewName)),
    // One preview per width band above the first, at its capture width.
    ...(screen.breakpoints?.names.slice(1) ?? []).flatMap((band, i) => [
      "",
      ...preview(
        opts.adaptive ? "light" : screen.theme,
        `${viewName} — ${band}`,
        "",
        screen.breakpoints!.widths[i + 1],
      ),
    ]),
    // One preview per in-flow layer, shown open.
    ...[...control.openStates].flatMap(([layer, state]) => [
      "",
      ...preview(opts.adaptive ? "light" : screen.theme, `${viewName} — ${layer} open`, `${state}: true`),
    ]),
    ...(extraction?.previews.length ? ["", ...extraction.previews] : []),
  ];
  // After emission: `note()` may have regraded nodes for emit-time losses.
  visit(screen.root, (n) => {
    if (n.confidence !== "mapped")
      report.push({ id: n.id, kind: n.kind, confidence: n.confidence, diagnostics: n.diagnostics });
  });
  const openStates = control.openStates.size ? { openStates: Object.fromEntries(control.openStates) } : {};
  return { view: lines.join("\n") + "\n", shapes, images, report, ...openStates };
}
