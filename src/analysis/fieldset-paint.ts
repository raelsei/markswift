import type { LayoutNode } from "../model/layout.ts";
import type { SemBase, Style } from "../model/semantic.ts";
import type { InferenceContext } from "./context.ts";
import { relativePosition } from "./relative-position.ts";
import { styleOf } from "./style.ts";

interface Admission { legend?: LayoutNode; reason?: string }
const ordinary = (value: string | undefined) => value === undefined || /^(block|inline-block|flow-root)$/.test(value);
const rendered = (node: LayoutNode) => node.styles.display !== "none";
const inFlow = (node: LayoutNode) => (node.styles.float ?? "none") === "none" && !/^(absolute|fixed)$/.test(node.styles.position ?? "static");

/** Admit only decoration whose source border geometry is represented by the current semantic paint. */
export function fieldsetAdmission(node: LayoutNode, style: Style): Admission {
  const legends = node.children.filter(child => child.tag === "legend" && rendered(child));
  const legend = legends.find(inFlow);
  if (!legend) return legends.length ? { reason: "floated/absolute legend has no supported rendered-legend decoration" } : {};
  if ((node.styles["writing-mode"] ?? "horizontal-tb") !== "horizontal-tb") return { reason: "vertical writing mode" };
  if (!ordinary(node.styles.display) || !ordinary(legend.styles.display)) return { reason: "nonordinary or inline-collapsed legend flow" };
  if (!Number.isFinite(legend.bounds.w) || !Number.isFinite(legend.bounds.h) || legend.bounds.w <= 0 || legend.bounds.h <= 0) return { reason: "legend border geometry unavailable" };
  if (relativePosition(legend).reason) return { reason: "relative legend displacement is not fixed-pixel proved" };
  if (legend.styles.transform && legend.styles.transform !== "none") return { reason: "transformed legend static border geometry" };
  if (["box-shadow", "filter", "backdrop-filter", "transform", "mask-image", "clip-path"].some(property => node.styles[property] && node.styles[property] !== "none")) return { reason: "complex fieldset effect/clip/shadow" };
  if (style.shadows.length || style.filters?.length || style.blur !== undefined || style.backdropBlur !== undefined || style.transform || style.mask || style.clipPath || style.clip || style.outline || style.blend) return { reason: "complex fieldset effect/clip/shadow" };
  if ((node.styles["background-image"] && node.styles["background-image"] !== "none")
    || (node.styles["background-clip"] && node.styles["background-clip"] !== "border-box")
    || (node.styles["background-blend-mode"] && node.styles["background-blend-mode"] !== "normal")) return { reason: "complex fieldset fill or background clipping" };
  if (style.fills.some(fill => fill.kind !== "solid" || fill.blend || fill.inset?.some(inset => inset !== 0))) return { reason: "complex fieldset fill or background clipping" };
  if (style.borderSides || style.border?.dashed) return { reason: "nonuniform or nonsolid fieldset border" };
  const edges = ["top", "right", "bottom", "left"].map(edge => ({
    width: node.styles[`border-${edge}-width`] ?? "0px", style: node.styles[`border-${edge}-style`] ?? "none", color: node.styles[`border-${edge}-color`] ?? "",
  }));
  if (edges.some(edge => edge.width !== edges[0]!.width || edge.style !== edges[0]!.style || edge.color !== edges[0]!.color)
    || edges.some(edge => !["none", "hidden", "solid"].includes(edge.style))) return { reason: "nonuniform or nonsolid fieldset border" };
  for (const corner of ["top-left", "top-right", "bottom-right", "bottom-left"]) {
    const radius = node.styles[`border-${corner}-radius`];
    if (radius && (!/^(?:\d+(?:\.\d+)?px|0)(?: (?:\d+(?:\.\d+)?px|0))?$/.test(radius)
      || radius.split(" ").some(value => value !== radius.split(" ")[0]))) return { reason: "percentage or elliptical fieldset radius" };
  }
  return { legend };
}

function keyFor(node: LayoutNode, root: LayoutNode): string {
  // Original ids can be empty or duplicated in legacy captures; structural occurrence is stable.
  const locate = (current: LayoutNode, path: string): string | undefined => {
    if (current === node) return path;
    for (let index = 0; index < current.children.length; index++) {
      const found = locate(current.children[index]!, `${path}/${index}`);
      if (found) return found;
    }
    return undefined;
  };
  return `fieldset:${locate(root, "root") ?? node.id ?? "unknown"}`;
}

/** Metadata adds decoration only; it never changes the measured frame, padding or child layout. */
export function fieldsetMetadata(node: LayoutNode, ctx: InferenceContext, style: Style, notes: string[]): Pick<SemBase, "fieldsetPaint" | "fieldsetLegend"> {
  if (node.tag === "fieldset") {
    const { legend, reason } = fieldsetAdmission(node, style);
    if (reason) notes.push(`approximated: fieldset decoration (${reason}) → ordinary captured box paint`);
    return legend ? { fieldsetPaint: { key: keyFor(node, ctx.root), legendId: legend.id ?? "" } } : {};
  }
  if (node.tag === "legend" && ctx.parent?.tag === "fieldset") {
    const parent = ctx.parent;
    const { legend } = fieldsetAdmission(parent, styleOf(parent, []));
    if (legend === node) return { fieldsetLegend: { key: keyFor(parent, ctx.root), relativeOffset: relativePosition(node).offset ?? [0, 0] } };
  }
  return {};
}
