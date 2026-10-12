/** Assemble a screen from cohesive Swift emission modules. */
import type { Screen, SemNode, StackNode, GridNode } from "../model/semantic.ts";
import type { Theme } from "../model/layout.ts";
import { GENERATED_BY } from "../model/version.ts";
import { colorArgs, identifier, indent, num, uniqueName } from "./format.ts";
import { controlMembers } from "./control-state.ts";
import type { EmitContext, EmitOptions, SwiftOutput } from "./context.ts";
import { extractComponents } from "./components.ts";
import { refOf } from "./nodes.ts";
import { containerExpr } from "./layout.ts";
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
  const allocated = new Map<SemNode, "width" | "both">();
  visit(screen.root, (n) => {
    if (n.kind !== "stack" && n.kind !== "grid") return;
    props.push({ name: uniqueName(`v_${identifier(n.id) || "n" + props.length}`, seen), node: n });
    // A measured layout proposes each child its captured box, which already holds CSS's minimum.
    // App mode: MarkswiftTracks proposes each cell its column width and, with stretch, its row
    // height; without stretch it proposes no height, so a filling cell takes its content height
    // (its captured height, measured or not, is dropped either way). px-sized cells keep their frames.
    const tracks = opts.mode === "app" && n.kind === "grid" ? n.template : undefined;
    if ((!n.measured || tracks) && (n.kind === "grid" || n.axis === "h" || n.width.kind === "hug"))
      for (const c of n.children) contentMinWidth.add(c);
    if (tracks)
      for (const [i, c] of tracks.cells.entries()) if (!tracks.fixed.includes(i)) allocated.set(n.children[c]!, "both");
  });
  const nameOf = new Map<SemNode, string>();
  for (const p of props) nameOf.set(p.node, p.name);
  // Control state pass: a control owns its value, so the view that holds it declares the storage.
  const control = controlMembers(screen.root);
  const scaledFonts = new Map<string, string>();
  const ctx: EmitContext = {
    fontMetrics: opts.fontMetrics ?? {},
    nameOf,
    contentMinWidth,
    allocated,
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
  const extraction = opts.mode === "app" && opts.extract !== false ? extractComponents(screen, ctx) : undefined;

  const comment = (value: string) => value.replace(/[\r\n\u2028\u2029]/g, " ");
  // Body first: emitting it registers the `@ScaledMetric` font sizes declared above it.
  const body = ["var body: some View {", ...indent(refOf(screen.root, ctx), 1), "}"];
  for (const p of props) {
    if (extraction?.absorbed.has(p.node)) continue;
    body.push(
      "",
      `// ${comment(p.node.id)}`,
      `private var ${p.name}: some View {`,
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
  const members = [...scaled];
  if (scaled.length) members.push("");
  const decls = extraction?.decls ?? control.decls;
  members.push(...decls);
  if (decls.length) members.push("");
  members.push(...body);
  const preview = (theme: Theme, title: string) => [
    `#Preview("${title}") {`,
    ...indent(
      [
        `${viewName}()`,
        `.frame(width: ${num(screen.size.w)}, height: ${num(screen.size.h)})`,
        `.background(Color.markswift(${colorArgs(theme === "dark" ? { r: 0.043, g: 0.055, b: 0.075, a: 1 } : { r: 0.957, g: 0.965, b: 0.98, a: 1 })}))`,
        `.preferredColorScheme(.${theme})`,
      ],
      1,
    ),
    "}",
  ];
  const lines = [
    `// ${GENERATED_BY} — tool-owned: regenerate with \`markswift convert --update\`; customise through the initializer or your own files. Source: ` +
      comment(screen.source) +
      " (" +
      comment(screen.name) +
      ", " +
      (opts.adaptive ? "light + dark" : screen.theme) +
      ")",
    "import SwiftUI",
    "",
    `struct ${viewName}: View {`,
    ...indent(members, 1),
    "}",
    "",
    ...(extraction ? [`extension ${viewName} {`, ...indent(extraction.extension, 1), "}", ""] : []),
    ...(opts.adaptive
      ? [...preview("light", `${viewName} — Light`), "", ...preview("dark", `${viewName} — Dark`)]
      : preview(screen.theme, viewName)),
  ];
  // After emission: `note()` may have regraded nodes for emit-time losses.
  visit(screen.root, (n) => {
    if (n.confidence !== "mapped")
      report.push({ id: n.id, kind: n.kind, confidence: n.confidence, diagnostics: n.diagnostics });
  });
  return { view: lines.join("\n") + "\n", shapes, images, report };
}
