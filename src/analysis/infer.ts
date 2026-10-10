/** Layout tree traversal and semantic node dispatch. */
import { type LayoutDoc, type LayoutNode } from "../model/layout.ts";
import { type Screen, type SemNode, type StackNode, type SemBase, type Overlay, addDiagnostic } from "../model/semantic.ts";
import { parseColor, parseDeclared, round2 } from "../css/index.ts";
import { buildSvg } from "./svg/build.ts";
import { controlOf, buildControl } from "./controls.ts";
import { classifyElement } from "../html/policy.ts";
import { type InferOptions, type InferenceContext, type SourceTextRun, type AnalyzedChild } from "./context.ts";
import { finish, makeBase, withBase } from "./node-base.ts";
import { fontOf } from "./typography.ts";
import { isInlineText, collectRuns, groupRuns } from "./text-runs.ts";
import { linesOf, stackOf } from "./flow-layout.ts";
import { buildGrid } from "./grid.ts";
import { buildWrapping } from "./wrapping.ts";
import { crossAlign, distributionOf } from "./alignment.ts";
import { buildText } from "./text.ts";
import { unionRect, insetsOf, renders, hangsLeading, floating, isFlex, mainAxis, outOfFlow } from "./geometry.ts";

export function inferScreen(doc: LayoutDoc, name: string, options: InferOptions = {}): Screen {
  const ctx: InferenceContext = { root: doc.root, fixed: [], bundledFamilies: options.bundledFamilies ?? {} };
  const root = build(doc.root, ctx);
  root.width = { kind: "fill" };
  root.height = { kind: "fill" };
  // Fixed-position nodes do not scroll with content: they overlay the screen, not their DOM parent.
  if (ctx.fixed.length) root.overlays.push(...buildOverlays(doc.root, ctx.fixed, undefined, ctx));
  const canvas = parseColor(doc.canvas) ?? { r: 1, g: 1, b: 1, a: 1 };
  return { version: 1, name, source: doc.source, theme: doc.combo.theme, size: doc.size, canvas, root };
}

function build(n: LayoutNode, ctx: InferenceContext): SemNode {
  const policy = classifyElement(n.tag, n.attrs);
  if (policy.route === "svg") return finish(buildSvg(n, makeBase(n, ctx, parseDeclared(n.attrs["style"])), ctx.root, ctx.bundledFamilies));
  // `alt` needs the element's own text style: the browser paints it in place of a broken source.
  if (policy.route === "image")
    return withBase(n, ctx, {
      kind: "image",
      src: n.currentSrc ?? n.attrs["src"] ?? "",
      contentMode: n.styles["object-fit"] === "contain" ? "fit" : "fill",
      ...(n.attrs["alt"] ? { alt: n.attrs["alt"], font: fontOf(n.styles, ctx.bundledFamilies), ...(parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {}) } : n.attrs["alt"] !== undefined ? { alt: n.attrs["alt"] } : {}),
    });

  const flow: LayoutNode[] = [];
  const abs: LayoutNode[] = [];
  const runs: SourceTextRun[] = [];
  for (const c of n.children) {
    if (c.tag === "#text" || c.tag === "br") {
      runs.push({ node: c, styleOf: n });
      continue;
    }
    if (isInlineText(c)) {
      collectRuns(c, runs);
      continue;
    }
    if (c.styles["position"] === "fixed" && n !== ctx.root) ctx.fixed.push(c);
    else if (outOfFlow(c)) abs.push(c);
    else flow.push(c);
  }

  // Embedded content needs a dedicated renderer. Keep its own paint and positioned decoration.
  // An object's captured descendants are its visible fallback, so preserve that content below.
  if (policy.route === "placeholder" && !(n.tag === "object" && n.children.length)) {
    const box = withBase(n, ctx, { kind: "box" });
    box.overlays = buildOverlays(n, abs, undefined, ctx);
    return finish(box);
  }

  // Controls come before the generic container path: same measured box, native control inside.
  const spec = policy.route === "control" ? controlOf(n) : undefined;
  if (spec) {
    const childAxis = mainAxis(n);
    const childCtx: InferenceContext = { ...ctx, parent: n, parentAxis: childAxis, parentDisplay: n.styles["display"] ?? "block", parentAlign: crossAlign(n) };
    const node = buildControl(spec, {
      base: makeBase(n, ctx, parseDeclared(n.attrs["style"])),
      children: flow.map((c) => ({ node: c, sem: build(c, childCtx) })),
      texts: runs.length ? groupRuns(n, runs).map((g) => buildText(n, g, childCtx)).filter((t) => t.runs.length > 0) : [],
      font: fontOf(n.styles, ctx.bundledFamilies),
      ...(parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {}),
    });
    node.overlays = buildOverlays(n, abs, flow[0], ctx);
    return finish(node);
  }
  // A run group can collapse to nothing at all: every run in it is collapsible whitespace that
  // the browser also collapsed away — the newline between two inline controls, a `<div> </div>`.
  // Such a node has no glyphs, no advance and no measured inline box, so it is not text; it is
  // the element's own box, and the check is on the *result* rather than the input because only
  // `buildText` knows the `white-space` mode that decides whether a space survives. Letting one
  // through emitted an empty run array, which does not compile in either mode.
  if (flow.length === 0 && runs.length > 0) {
    const t = buildText(n, runs, ctx, true);
    if (t.runs.length > 0) {
      // `buildText` may already have added background layers for inline runs that paint their own
      // box (`mark`, `kbd`); absolutely positioned children come on top of those.
      t.overlays.push(...buildOverlays(n, abs, undefined, ctx));
      return t;
    }
  }
  if (flow.length === 0) {
    const box = withBase(n, ctx, { kind: "box" });
    box.overlays = buildOverlays(n, abs, undefined, ctx);
    return box;
  }

  const display = n.styles["display"] ?? "block";
  const axis = mainAxis(n);
  const declared = parseDeclared(n.attrs["style"]);

  // Children in measured order (handles CSS `order`), text runs grouped between flow children.
  const items: AnalyzedChild[] = [];
  const childCtx: InferenceContext = { ...ctx, parent: n, parentAxis: axis, parentDisplay: display, parentAlign: crossAlign(n) };
  for (const c of flow) items.push({ node: c, sem: build(c, childCtx) });
  if (runs.length) {
    // Text interleaved with flow children (icon + label). Group consecutive runs into one text node.
    const groups = groupRuns(n, runs);
    for (const g of groups) {
      const t = buildText(n, g, childCtx);
      if (t.runs.length === 0) continue;
      // Only the text's own geometry and paint order: the host's float, margins, flex and
      // alignment styles belong to the host box, not to one of its text groups.
      const textItem: LayoutNode = { tag: n.tag, attrs: {}, styles: { display: "inline" }, bounds: t.frame, children: [], ...(n.paint !== undefined ? { paint: n.paint } : {}) };
      items.push({ node: textItem, sem: t });
    }
  }

  const base = makeBase(n, ctx, declared);
  const diagnostics = base.diagnostics;

  if (display === "grid" || display === "inline-grid") {
    const grid = buildGrid(n, base, items);
    grid.overlays = buildOverlays(n, abs, flow[0], ctx);
    return finish(grid);
  }

  const align = crossAlign(n);
  const distribution = distributionOf(n.styles["justify-content"], display);
  // Ordinary float/inline-block lines become measured rows. Flex wrapping has its own native
  // reflow path and a captured-position fallback, including column and reverse wrapping.
  const wraps = isFlex(display) && /^(wrap|wrap-reverse)$/.test(n.styles["flex-wrap"] ?? "");
  const lines = axis === "h" ? [[...items].sort((a, b) => a.sem.frame.x - b.sem.frame.x)] : linesOf(items);
  let stack: StackNode;
  const multi = lines.some((l) => l.length > 1);
  if (wraps) {
    stack = buildWrapping(n, base, items, axis, align, distribution);
  } else if (multi && lines.length === 1 && axis === "v") {
    // One measured line of side-by-side blocks (table cells, inline-blocks, a float and its text).
    if (lines[0]!.some((i) => floating(i.node))) addDiagnostic(diagnostics, "approximated", "float", "float → side-by-side row; text does not wrap around it");
    stack = stackOf(base, "h", lines[0]!, "start", "start");
  } else if (multi && lines.length > 1) {
    const floats = items.filter((i) => floating(i.node));
    if (floats.length) addDiagnostic(diagnostics, "approximated", "float", "float → side-by-side row; text does not wrap around it");
    for (const d of new Set(flow.map((c) => c.styles.display).filter((d) => d === "inline-block" || d === "inline-flex" || d === "inline-grid")))
      addDiagnostic(diagnostics, "approximated", `display: ${d}`, `${d} items → rows of the captured line division; they do not re-wrap at another width`);
    const rows: AnalyzedChild[] = lines.map((line, i) => {
      if (line.length === 1) return line[0]!;
      const u = line.map((it) => it.sem.frame).reduce(unionRect);
      const rowBase: SemBase = {
        id: base.id ? `${base.id}/row${i}` : "",
        frame: { x: n.bounds.x + base.padding[3], y: u.y, w: n.bounds.w - base.padding[1] - base.padding[3], h: u.h },
        width: { kind: "fill" },
        height: { kind: "hug" },
        padding: [0, 0, 0, 0],
        style: { fills: [], shadows: [] },
        confidence: "mapped",
        diagnostics: [],
        overlays: [],
      };
      const row = finish(stackOf(rowBase, "h", line, "start", "start"));
      return { node: n, sem: row };
    });
    stack = stackOf(base, "v", rows, "stretch", "start");
  } else {
    stack = stackOf(base, axis, lines.flat(), align, distribution);
  }

  const items2 = stack.children;
  const oy = n.styles["overflow-y"];
  const ox = n.styles["overflow-x"];
  if (oy === "auto" || oy === "scroll") {
    const contentBottom = Math.max(...items2.map((i) => i.frame.y + i.frame.h), n.bounds.y);
    if (contentBottom > n.bounds.y + n.bounds.h + 0.5 || oy === "scroll") stack.scroll = "v";
  }
  if (!stack.scroll && (ox === "auto" || ox === "scroll")) {
    const contentRight = Math.max(...items2.map((i) => i.frame.x + i.frame.w), n.bounds.x);
    if (contentRight > n.bounds.x + n.bounds.w + 0.5 || ox === "scroll") stack.scroll = "h";
  }
  stack.overlays = buildOverlays(n, abs, flow[0], ctx);
  return finish(stack);
}

function buildOverlays(host: LayoutNode, abs: LayoutNode[], firstFlow: LayoutNode | undefined, ctx: InferenceContext): Overlay[] {
  const out: Overlay[] = [];
  const flowPaint = firstFlow?.paint ?? Number.POSITIVE_INFINITY;
  // Stacking order = global paint order (accounts for z-index), not DOM order.
  for (const c of [...abs].sort((a, b) => (a.paint ?? 0) - (b.paint ?? 0))) {
    const sem = build(c, { root: ctx.root, fixed: ctx.fixed, bundledFamilies: ctx.bundledFamilies, parent: host });
    const covers = Math.abs(c.bounds.x - host.bounds.x) < 0.5 && Math.abs(c.bounds.y - host.bounds.y) < 0.5 && Math.abs(c.bounds.w - host.bounds.w) < 0.5 && Math.abs(c.bounds.h - host.bounds.h) < 0.5;
    if (covers) {
      sem.width = { kind: "fill" };
      sem.height = { kind: "fill" };
    } else {
      sem.width = { kind: "fixed", px: round2(c.bounds.w) };
      sem.height = { kind: "fixed", px: round2(c.bounds.h) };
    }
    out.push({
      node: sem,
      layer: (c.paint ?? 0) < flowPaint ? "background" : "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers,
    });
  }
  // Outside list markers hang in the host's padding and are dropped from the flow (`stackOf`),
  // so they are drawn here instead: anchored where the browser put them, at their natural size
  // (unlike a positioned overlay, whose box the author pinned).
  const contentLeft = host.bounds.x + insetsOf(host.styles)[3];
  for (const c of host.children) {
    if (c.tag === "#text" || c.tag === "br" || !renders(c) || isInlineText(c)) continue;
    if (outOfFlow(c) || !hangsLeading(c.bounds, contentLeft)) continue;
    out.push({
      node: build(c, { root: ctx.root, fixed: ctx.fixed, bundledFamilies: ctx.bundledFamilies, parent: host }),
      layer: "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers: false,
    });
  }
  return out;
}

