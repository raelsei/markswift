import type { LayoutNode } from "../model/layout.ts";
import type { SemNode, Axis, ImageNode } from "../model/semantic.ts";
import { imageSize, parseColor, parseDeclared } from "../css/index.ts";
import { buildSvg } from "./svg.ts";
import { controlOf, buildControl } from "./controls.ts";
import { classifyElement } from "../html/policy.ts";
import type { InferenceContext, AnalyzedChild } from "./context.ts";
import { finish, makeBase, withBase } from "./node-base.ts";
import { fontOf } from "./typography.ts";
import { groupRuns } from "./text-runs.ts";
import { buildGrid } from "./grid.ts";
import { crossAlign } from "./alignment.ts";
import { buildText } from "./text.ts";
import { partitionChildren } from "./infer-children.ts";
import { buildFlowStack } from "./infer-flow.ts";
import { buildOverlays } from "./infer-overlays.ts";
import { buildNativeTable, tableFallbackReason } from "./table-layout.ts";

export function build(n: LayoutNode, ctx: InferenceContext): SemNode {
  const policy = classifyElement(n.tag, n.attrs);
  if (n.tag === "table") {
    const table = buildNativeTable(n, makeBase(n, ctx, parseDeclared(n.attrs.style)), ctx, build);
    if (table) return finish(table);
  }
  if (policy.route === "svg") return finish(buildSvg(n, makeBase(n, ctx, parseDeclared(n.attrs["style"])), ctx.root, ctx.bundledFamilies));
  // `alt` needs the element's own text style: the browser paints it in place of a broken source.
  if (policy.route === "image") {
    const fit = n.styles["object-fit"] ?? "fill";
    const position = n.styles["object-position"] ?? "50% 50%";
    const src = n.tag === "video" ? n.attrs["poster"] ?? "" : n.attrs["data-h2s-src"] ?? n.attrs["src"] ?? "";
    const anchor = objectPosition(position);
    const intrinsic = anchor && (anchor[0] !== 0.5 || anchor[1] !== 0.5) && (fit === "cover" || fit === "contain") ? imageSize(src) : undefined;
    const image = withBase(n, ctx, {
      kind: "image",
      src,
      contentMode: fit === "cover" ? "fill" : fit === "contain" || fit === "scale-down" ? "fit" : fit === "none" ? "none" : "stretch",
      ...(intrinsic && intrinsic.w > 0 && intrinsic.h > 0 ? { intrinsicSize: [intrinsic.w, intrinsic.h] as [number, number] } : {}),
      ...(n.attrs["alt"] ? { alt: n.attrs["alt"], font: fontOf(n.styles, ctx.bundledFamilies), ...(parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {}) } : n.attrs["alt"] !== undefined ? { alt: n.attrs["alt"] } : {}),
    }) as ImageNode;
    if (fit === "scale-down") image.notes.push("approximated: object-fit: scale-down → contain; native intrinsic image size is unknown");
    if (fit === "none") image.notes.push("approximated: object-fit: none → unscaled native image; asset pixel scale may differ from browser CSS pixels");
    if (fit !== "fill" && (anchor === undefined || anchor[0] !== 0.5 || anchor[1] !== 0.5)) {
      if (anchor && intrinsic && intrinsic.w > 0 && intrinsic.h > 0 && (fit === "cover" || fit === "contain")) image.objectPosition = anchor;
      else image.notes.push(`approximated: object-position: ${position} → centered image content; ${!anchor ? "position syntax unsupported" : fit !== "cover" && fit !== "contain" ? "object-fit mode unsupported" : "intrinsic image size unavailable"}`);
    }
    return finish(image);
  }

  const { flow, abs, runs } = partitionChildren(n, ctx);

  // Embedded content needs a dedicated renderer. Keep its own paint and positioned decoration.
  // An object's captured descendants are its visible fallback, so preserve that content below.
  if (policy.route === "placeholder" && !(n.tag === "object" && n.children.length)) {
    const box = withBase(n, ctx, { kind: "box" });
    box.overlays = buildOverlays(n, abs, undefined, ctx, build);
    return finish(box);
  }

  // Controls come before the generic container path: same measured box, native control inside.
  const spec = policy.route === "control" ? controlOf(n) : undefined;
  if (spec) {
    const childAxis: Axis = /flex/.test(n.styles["display"] ?? "block") && /^row/.test(n.styles["flex-direction"] ?? "row") ? "h" : "v";
    const childCtx: InferenceContext = { ...ctx, parent: n, parentAxis: childAxis, parentDisplay: n.styles["display"] ?? "block", parentAlign: crossAlign(n, childAxis) };
    const node = buildControl(spec, {
      base: makeBase(n, ctx, parseDeclared(n.attrs["style"])),
      // Select descendants supply choice metadata; their native rows are the rendered content.
      children: spec.control === "picker" ? [] : flow.map((c) => ({ node: c, sem: build(c, childCtx) })),
      texts: spec.control !== "picker" && runs.length ? groupRuns(n, runs).map((g) => buildText(n, g, childCtx)).filter((t) => t.runs.length > 0) : [],
      font: fontOf(n.styles, ctx.bundledFamilies),
      ...(parseColor(n.styles["color"]) ? { color: parseColor(n.styles["color"]) } : {}),
    });
    node.overlays = buildOverlays(n, abs, flow[0], ctx, build);
    return finish(node);
  }
  // A run group can collapse to nothing at all: every run in it is collapsible whitespace that
  // the browser also collapsed away — the newline between two inline controls, a `<div> </div>`.
  // Such a node has no glyphs, no advance and no measured inline box, so it is not text; it is
  // the element's own box, and the check is on the *result* rather than the input because only
  // `buildText` knows the `white-space` mode that decides whether a space survives. Letting one
  // through emitted `Text.h2sRuns([\n    ,\n])`, which does not compile in either mode.
  if (flow.length === 0 && runs.length > 0) {
    const t = buildText(n, runs, ctx, true);
    if (t.runs.length > 0) {
      // `buildText` may already have added background layers for inline runs that paint their own
      // box (`mark`, `kbd`); absolutely positioned children come on top of those.
      t.overlays.push(...buildOverlays(n, abs, undefined, ctx, build));
      return t;
    }
  }
  if (flow.length === 0) {
    const box = withBase(n, ctx, { kind: "box" });
    box.overlays = buildOverlays(n, abs, undefined, ctx, build);
    return box;
  }

  const display = n.styles["display"] ?? "block";
  const axis: Axis = /flex/.test(display) && /^row/.test(n.styles["flex-direction"] ?? "row") ? "h" : "v";
  const declared = parseDeclared(n.attrs["style"]);

  // Children in measured order (handles CSS `order`), text runs grouped between flow children.
  const items: AnalyzedChild[] = [];
  const childCtx: InferenceContext = { ...ctx, parent: n, parentAxis: axis, parentDisplay: display, parentAlign: crossAlign(n, axis) };
  for (const c of flow) items.push({ node: c, sem: build(c, childCtx) });
  if (runs.length) {
    // Text interleaved with flow children (icon + label). Group consecutive runs into one text node.
    const groups = groupRuns(n, runs);
    for (const g of groups) {
      const t = buildText(n, g, childCtx);
      if (t.runs.length === 0) continue;
      items.push({ node: { ...n, bounds: t.frame, children: [] }, sem: t });
    }
  }

  const base = makeBase(n, ctx, declared);

  if (display === "grid" || display === "inline-grid") {
    const grid = buildGrid(n, base, items);
    grid.overlays = buildOverlays(n, abs, flow[0], ctx, build);
    return finish(grid);
  }

  const stack = buildFlowStack(n, base, items, axis, display);
  if (n.tag === "table") {
    const reason = tableFallbackReason(n);
    if (reason) stack.notes.push(reason);
  }
  stack.overlays = buildOverlays(n, abs, flow[0], ctx, build);
  return finish(stack);
}

/** Browser-computed `object-position` percentages and side keywords; length offsets need a separate CSS length model. */
function objectPosition(value: string): [number, number] | undefined {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  if (!tokens.length || tokens.length > 2) return undefined;
  const x = (token: string): number | undefined => token === "left" ? 0 : token === "right" ? 1 : token === "center" ? 0.5 : percent(token);
  const y = (token: string): number | undefined => token === "top" ? 0 : token === "bottom" ? 1 : token === "center" ? 0.5 : percent(token);
  if (tokens.length === 1) {
    const token = tokens[0]!;
    if (token === "top" || token === "bottom") return [0.5, y(token)!];
    const horizontal = x(token);
    return horizontal === undefined ? undefined : [horizontal, 0.5];
  }
  const [first, second] = tokens as [string, string];
  const verticalFirst = first === "top" || first === "bottom" || second === "left" || second === "right";
  const horizontal = x(verticalFirst ? second : first);
  const vertical = y(verticalFirst ? first : second);
  return horizontal === undefined || vertical === undefined ? undefined : [horizontal, vertical];
}

function percent(value: string): number | undefined {
  return /^-?(?:\d+\.?\d*|\.\d+)%$/.test(value) ? Number.parseFloat(value) / 100 : undefined;
}
