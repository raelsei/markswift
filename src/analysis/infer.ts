/** Layout tree traversal and semantic node dispatch. */
import { type LayoutDoc, type LayoutNode, type Rect } from "../model/layout.ts";
import {
  type Screen,
  type SemNode,
  type StackNode,
  type SemBase,
  type Overlay,
  type Axis,
  type CrossAlign,
  type Diagnostic,
  addDiagnostic,
} from "../model/semantic.ts";
import { parseColor, parseDeclared, px, round2 } from "../css/index.ts";
import { buildSvg } from "./svg/build.ts";
import { svgFromDataUrl } from "./svg/markup.ts";
import { controlOf, buildControl, labelIndex } from "./controls.ts";
import { classifyElement } from "../html/policy.ts";
import { type InferOptions, type InferenceContext, type SourceTextRun, type AnalyzedChild } from "./context.ts";
import { finish, makeBase, withBase } from "./node-base.ts";
import { fontOf } from "./typography.ts";
import { isInlineText, collectRuns, groupRuns } from "./text-runs.ts";
import { linesOf, stackOf } from "./flow-layout.ts";
import { buildGrid } from "./grid.ts";
import { buildWrapping } from "./wrapping.ts";
import { admitFlexRow } from "./flex-row.ts";
import { crossAlign, distributionOf } from "./alignment.ts";
import { buildText } from "./text.ts";
import {
  unionRect,
  insetsOf,
  renders,
  hangsLeading,
  floating,
  isFlex,
  mainAxis,
  outOfFlow,
  edgeWidth,
} from "./geometry.ts";
import { collapseTableBorders, hideEmptyCells } from "./table-borders.ts";
import { clipsText } from "./style-background.ts";
import { dropInvisible, pruneHitTesting } from "./invisible.ts";
import { applyTooltips } from "./tooltips.ts";

/** A table cell's `vertical-align` as the row's cross alignment (`top`/`baseline` stay at the start). */
const CELL_ALIGN: Record<string, CrossAlign> = { middle: "center", bottom: "end" };

export function inferScreen(doc: LayoutDoc, name: string, options: InferOptions = {}): Screen {
  const ctx: InferenceContext = {
    root: doc.root,
    fixed: [],
    bundledFamilies: options.bundledFamilies ?? {},
    viewport: doc.viewport,
    labels: labelIndex(doc.root),
  };
  const root = build(doc.root, ctx);
  root.width = { kind: "fill" };
  root.height = { kind: "fill" };
  // A root as tall as the viewport (`min-h-screen`, `100vh`) already fills the screen: the device decides, not 844px.
  if (root.minHeight !== undefined && Math.abs(root.minHeight - doc.viewport.h) <= 0.5) delete root.minHeight;
  // Fixed-position nodes do not scroll with content: they overlay the screen, not their DOM parent.
  // Building one can hoist fixed descendants of its own, so drain the list until it stops growing.
  // ponytail: each batch is paint-sorted on its own; a nested fixed node paints after its fixed
  // ancestor, so batch order matches paint order except for negative z-index inside a fixed layer.
  for (let built = 0; built < ctx.fixed.length; ) {
    const batch = ctx.fixed.slice(built);
    built = ctx.fixed.length;
    root.overlays.push(...buildOverlays(doc.root, batch, undefined, ctx));
  }
  // The document scrolled in the browser: content past the viewport must stay reachable.
  if (doc.size.h > doc.viewport.y + doc.viewport.h + 0.5 && root.kind === "stack" && !root.scroll) root.scroll = "v";
  const canvas = parseColor(doc.canvas) ?? { r: 1, g: 1, b: 1, a: 1 };
  applyTooltips(root, doc);
  dropInvisible(root);
  pruneHitTesting(root);
  // `dark only` and `dark` force a scheme; `light dark`, `normal` and a missing key leave it to the app.
  const schemes = (doc.root.styles["color-scheme"] ?? "").split(/\s+/).filter((t) => t && t !== "only");
  const colorScheme =
    schemes.length === 1 && (schemes[0] === "light" || schemes[0] === "dark") ? schemes[0] : undefined;
  return {
    version: 1,
    name,
    source: doc.source,
    theme: doc.combo.theme,
    size: doc.size,
    canvas,
    root,
    ...(colorScheme ? { colorScheme } : {}),
  };
}

function build(input: LayoutNode, ctx: InferenceContext): SemNode {
  const t = hideEmptyCells(collapseTableBorders(input));
  const n = t.tag === "table" ? captionOutside(t) : t;
  const policy = classifyElement(n.tag, n.attrs);
  if (policy.route === "svg")
    return finish(buildSvg(n, makeBase(n, ctx, parseDeclared(n.attrs["style"])), ctx.root, ctx.bundledFamilies));
  // `alt` needs the element's own text style: the browser paints it in place of a broken source.
  // A data: svg source is parsed here; the emitter draws its vector. A `<video>` shows its poster.
  if (policy.route === "image") {
    const src = n.currentSrc ?? n.attrs[n.tag === "video" ? "poster" : "src"] ?? "";
    const svg = svgFromDataUrl(src);
    const node = withBase(n, ctx, {
      kind: "image",
      src,
      ...(svg?.vector ? { vector: svg.vector } : {}),
      contentMode: "fill",
      ...(n.attrs["alt"]
        ? {
            alt: n.attrs["alt"],
            font: fontOf(n.styles, ctx.bundledFamilies),
            ...(parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {}),
          }
        : n.attrs["alt"] !== undefined
          ? { alt: n.attrs["alt"] }
          : {}),
    });
    if (svg?.vector)
      for (const d of svg.vector.diagnostics) addDiagnostic(node.diagnostics, d.level, d.feature, d.message);
    else if (svg) addDiagnostic(node.diagnostics, "unmapped", "img", "img svg data: URL has no viewBox; layer dropped");
    // `<input type=image>` is a button to assistive technology, as in Chrome's tree.
    if (n.tag === "input") node.a11y = { ...node.a11y, trait: "isButton" };
    imageFit(n, node);
    return node;
  }

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
  const spec = policy.route === "control" ? controlOf(n, ctx.labels) : undefined;
  if (spec) {
    const childAxis = mainAxis(n);
    const childCtx: InferenceContext = {
      ...ctx,
      parent: n,
      parentAxis: childAxis,
      parentDisplay: n.styles["display"] ?? "block",
      parentAlign: crossAlign(n),
      textClip: clipsText(n) ? n : ctx.textClip,
    };
    const node = buildControl(spec, {
      base: makeBase(n, ctx, parseDeclared(n.attrs["style"])),
      children: flow.map((c) => ({ node: c, sem: build(c, childCtx) })),
      texts: runs.length
        ? groupRuns(n, runs)
            .map((g) => buildText(n, g, childCtx))
            .filter((t) => t.runs.length > 0)
        : [],
      font: fontOf(n.styles, ctx.bundledFamilies),
      ...(parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {}),
      ...(n.styles["appearance"] !== undefined ? { appearance: n.styles["appearance"] } : {}),
      ...(parseColor(n.styles["accent-color"]) ? { accent: parseColor(n.styles["accent-color"]) } : {}),
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
      // A TextNode cannot host a ScrollView: report and clip, so the overflow at least stays inside its box.
      const axis = scrollAxis(
        n,
        runs.map((r) => r.node.bounds).filter((b) => b.w > 0 || b.h > 0),
      );
      if (axis) {
        const prop = axis === "v" ? "overflow-y" : "overflow-x";
        t.style.clip = true;
        addDiagnostic(
          t.diagnostics,
          "approximated",
          prop,
          `${prop} ${n.styles[prop]} on a text-only box → clipped; the text does not scroll`,
        );
        finish(t);
      }
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
  const childCtx: InferenceContext = {
    ...ctx,
    parent: n,
    parentAxis: axis,
    parentDisplay: display,
    parentAlign: crossAlign(n),
    textClip: clipsText(n) ? n : ctx.textClip,
  };
  for (const c of flow) items.push({ node: c, sem: build(c, childCtx) });
  if (runs.length) {
    // Text interleaved with flow children (icon + label). Group consecutive runs into one text node.
    const groups = groupRuns(n, runs);
    for (const g of groups) {
      const t = buildText(n, g, childCtx);
      if (t.runs.length === 0) continue;
      // Only the text's own geometry and paint order: the host's float, margins, flex and
      // alignment styles belong to the host box, not to one of its text groups.
      const textItem: LayoutNode = {
        tag: n.tag,
        attrs: {},
        styles: { display: "inline" },
        bounds: t.frame,
        children: [],
        ...(n.paint !== undefined ? { paint: n.paint } : {}),
      };
      items.push({ node: textItem, sem: t });
    }
  }

  const base = makeBase(n, ctx, declared);
  const diagnostics = base.diagnostics;

  if (display === "grid" || display === "inline-grid") {
    const grid = buildGrid(n, base, items);
    const scroll = scrollAxis(
      n,
      grid.children.map((c) => c.frame),
    );
    if (scroll) grid.scroll = scroll;
    grid.overlays = buildOverlays(n, abs, flow[0], ctx);
    return finish(grid);
  }

  const align = crossAlign(n);
  const distribution = distributionOf(n);
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
    if (lines[0]!.some((i) => floating(i.node)))
      addDiagnostic(diagnostics, "approximated", "float", "float → side-by-side row; text does not wrap around it");
    reportInlineRows(diagnostics, flow);
    // Cells are as tall as their row; a cell that hugs its content sits where `vertical-align` puts it.
    const va = new Set(lines[0]!.map((i) => i.node.styles["vertical-align"] ?? ""));
    const cells = display === "table-row" && va.size === 1 ? CELL_ALIGN[[...va][0]!] : undefined;
    stack = stackOf(base, "h", lines[0]!, cells ?? "start", "start");
  } else if (multi && lines.length > 1) {
    const floats = items.filter((i) => floating(i.node));
    if (floats.length)
      addDiagnostic(diagnostics, "approximated", "float", "float → side-by-side row; text does not wrap around it");
    reportInlineRows(diagnostics, flow);
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
    stack = stackOf(base, axis, lines.flat(), align, distribution, isFlex(display));
    // Admission excludes reverse rows and `order`, so the x-sorted children are the items in order.
    if (axis === "h") {
      const flex = admitFlexRow(n);
      if (flex && flex.items.length === stack.children.length) stack.flex = flex;
    }
    if (distribution === "between") {
      const g = px(n.styles[axis === "h" ? "column-gap" : "row-gap"]);
      if (g > 0) stack.minGap = round2(g);
    }
  }

  const scroll = scrollAxis(
    n,
    stack.children.map((c) => c.frame),
  );
  if (scroll) stack.scroll = scroll;
  stack.overlays = buildOverlays(n, abs, flow[0], ctx);
  return finish(stack);
}

/**
 * Chrome's table box includes its `<caption>`, but the table's own paint (background, border,
 * radius, shadow) covers only the row groups. The rows move into an anonymous block that carries
 * that paint; the table keeps its layout and loses its paint.
 */
// ponytail: caption margins are not subtracted from the rows box; measure them if a design spaces its caption.
function captionOutside(n: LayoutNode): LayoutNode {
  const first = n.children[0];
  const last = n.children[n.children.length - 1];
  const caption = first?.tag === "caption" ? first : last?.tag === "caption" ? last : undefined;
  if (!caption || n.children.length < 2) return n;
  const paint = Object.keys(n.styles).filter((k) => /^(background|border-|box-shadow)/.test(k));
  if (!paint.length) return n;
  const rest = n.children.filter((c) => c !== caption);
  // The side it is painted on (`caption-side`), not its place in the markup; the rows' box ends at
  // the table's border, not at the caption's margin.
  const top = caption.bounds.y < Math.min(...rest.map((c) => c.bounds.y));
  const shown = rest.filter(renders);
  if (!shown.length) return n;
  const grid = shown.map((c) => c.bounds).reduce(unionRect);
  const [bt, bb] = [edgeWidth(n.styles, "top"), edgeWidth(n.styles, "bottom")];
  const bounds = { x: n.bounds.x, y: grid.y - bt, w: n.bounds.w, h: grid.h + bt + bb };
  const rows: LayoutNode = {
    tag: "div",
    attrs: {},
    styles: { display: "block", ...Object.fromEntries(paint.map((k) => [k, n.styles[k]!])) },
    bounds,
    children: rest,
    ...(n.id !== undefined ? { id: `${n.id}/rows` } : {}),
    ...(n.paint !== undefined ? { paint: n.paint } : {}),
  };
  const styles = Object.fromEntries(Object.entries(n.styles).filter(([k]) => !paint.includes(k)));
  return { ...n, styles, children: top ? [caption, rows] : [rows, caption] };
}

/** Inline-level boxes laid out as captured rows never re-wrap natively, whether they filled one line or several. */
function reportInlineRows(diagnostics: Diagnostic[], flow: LayoutNode[]): void {
  for (const d of new Set(
    flow.map((c) => c.styles.display).filter((d) => d === "inline-block" || d === "inline-flex" || d === "inline-grid"),
  ))
    addDiagnostic(
      diagnostics,
      "approximated",
      `display: ${d}`,
      `${d} items → rows of the captured line division; they do not re-wrap at another width`,
    );
}

/** `overflow: auto/scroll` the content needs (`scroll` always scrolls): the axis a ScrollView covers. Vertical wins. */
function scrollAxis(n: LayoutNode, content: Rect[]): Axis | undefined {
  const oy = n.styles["overflow-y"],
    ox = n.styles["overflow-x"];
  if (oy === "auto" || oy === "scroll") {
    const bottom = Math.max(...content.map((f) => f.y + f.h), n.bounds.y);
    if (bottom > n.bounds.y + n.bounds.h + 0.5 || oy === "scroll") return "v";
  }
  if (ox === "auto" || ox === "scroll") {
    const right = Math.max(...content.map((f) => f.x + f.w), n.bounds.x);
    if (right > n.bounds.x + n.bounds.w + 0.5 || ox === "scroll") return "h";
  }
  return undefined;
}

/** `object-fit` / `object-position` → ImageNode fields. Percent positions are the browser's computed form (`top` → `50% 0%`). */
function imageFit(n: LayoutNode, node: SemNode): void {
  if (node.kind !== "image") return;
  const fit = n.styles["object-fit"] ?? "fill";
  node.contentMode =
    fit === "cover" || fit === "none" || fit === "contain" ? fit : fit === "scale-down" ? "contain" : "fill";
  if (fit === "scale-down")
    addDiagnostic(
      node.diagnostics,
      "approximated",
      "object-fit",
      "object-fit scale-down → contain (a source smaller than its box is enlarged)",
    );
  const pos = n.styles["object-position"];
  const m = pos ? /^(-?[\d.]+)% (-?[\d.]+)%$/.exec(pos) : null;
  if (m && (m[1] !== "50" || m[2] !== "50")) node.position = [+m[1]! / 100, +m[2]! / 100];
  else if (pos && !m)
    addDiagnostic(
      node.diagnostics,
      "approximated",
      "object-position",
      `object-position ${pos} → centred (only percentage/keyword positions map)`,
    );
  finish(node);
}

function buildOverlays(
  host: LayoutNode,
  abs: LayoutNode[],
  firstFlow: LayoutNode | undefined,
  ctx: InferenceContext,
): Overlay[] {
  const out: Overlay[] = [];
  const flowPaint = firstFlow?.paint ?? Number.POSITIVE_INFINITY;
  // Stacking order = global paint order (accounts for z-index), not DOM order.
  for (const c of [...abs].sort((a, b) => (a.paint ?? 0) - (b.paint ?? 0))) {
    const sem = build(c, {
      root: ctx.root,
      fixed: ctx.fixed,
      bundledFamilies: ctx.bundledFamilies,
      parent: host,
      viewport: ctx.viewport,
    });
    const covers =
      Math.abs(c.bounds.x - host.bounds.x) < 0.5 &&
      Math.abs(c.bounds.y - host.bounds.y) < 0.5 &&
      Math.abs(c.bounds.w - host.bounds.w) < 0.5 &&
      Math.abs(c.bounds.h - host.bounds.h) < 0.5;
    if (covers) {
      sem.width = { kind: "fill" };
      sem.height = { kind: "fill" };
    } else {
      sem.width = { kind: "fixed", px: round2(c.bounds.w) };
      sem.height = { kind: "fixed", px: round2(c.bounds.h) };
    }
    const insets = c.preferredSize?.insets;
    const trailing = insets?.left === "auto" && insets.right !== "auto";
    const bottom = insets?.top === "auto" && insets.bottom !== "auto";
    // Fixed boxes resolve against the viewport, not their hoisting host (the whole page).
    const box = c.styles["position"] === "fixed" && ctx.viewport ? ctx.viewport : host.bounds;
    const anchor =
      trailing || bottom
        ? {
            corner: (bottom ? (trailing ? "bottomTrailing" : "bottomLeading") : "topTrailing") as NonNullable<
              Overlay["anchor"]
            >["corner"],
            offset: [
              round2(trailing ? c.bounds.x + c.bounds.w - (box.x + box.w) : c.bounds.x - box.x),
              round2(bottom ? c.bounds.y + c.bounds.h - (box.y + box.h) : c.bounds.y - box.y),
            ] as [number, number],
          }
        : undefined;
    out.push({
      node: sem,
      layer: (c.paint ?? 0) < flowPaint ? "background" : "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers,
      ...(c.styles["position"] === "fixed" ? { fixed: true as const } : {}),
      ...(anchor && !covers ? { anchor } : {}),
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
      node: build(c, {
        root: ctx.root,
        fixed: ctx.fixed,
        bundledFamilies: ctx.bundledFamilies,
        parent: host,
        viewport: ctx.viewport,
      }),
      layer: "overlay",
      offset: [round2(c.bounds.x - host.bounds.x), round2(c.bounds.y - host.bounds.y)],
      covers: false,
    });
  }
  return out;
}
