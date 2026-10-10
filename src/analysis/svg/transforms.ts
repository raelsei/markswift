/** SVG affine transforms and path transformation. */
import { type LayoutNode } from "../../model/layout.ts";
import { type Diagnostic, addDiagnostic } from "../../model/semantic.ts";
import { default as svgpath } from "svgpath";
import { type SvgMatrix } from "./context.ts";

export const IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0];

// ---------- transforms ----------

export function multiply(m: SvgMatrix, n: SvgMatrix): SvgMatrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function isIdentity(m: SvgMatrix): boolean {
  return m.every((v, i) => Math.abs(v - IDENTITY[i]!) < 1e-9);
}

/**
 * The element's own transform: Chrome's computed `transform` (attribute and CSS alike, as a
 * matrix) about its `transform-origin`, in user units. Falls back to the attribute when the
 * snapshot carries no computed value.
 */
export function ownTransform(c: LayoutNode, diagnostics: Diagnostic[]): SvgMatrix {
  const computed = c.styles["transform"];
  if (computed !== undefined) {
    if (computed === "none") return IDENTITY;
    const m = /^matrix\(([^)]+)\)$/.exec(computed);
    if (!m) {
      addDiagnostic(diagnostics, "approximated", "transform", `svg 3D transform ignored (${computed})`);
      return IDENTITY;
    }
    const v = m[1]!.split(",").map(Number) as SvgMatrix;
    const o = /^([-\d.]+)px\s+([-\d.]+)px/.exec(c.styles["transform-origin"] ?? "");
    if (!o) return v;
    const ox = +o[1]!, oy = +o[2]!;
    return multiply(multiply([1, 0, 0, 1, ox, oy], v), [1, 0, 0, 1, -ox, -oy]);
  }
  return transformAttr(c.attrs["transform"]);
}

/** SVG transform list (`rotate(30 50 40) translate(…)`) → matrix; svgpath parses the list, three probe points recover it. */
export function transformAttr(attr: string | undefined): SvgMatrix {
  if (!attr) return IDENTITY;
  const pts: number[] = [];
  svgpath("M0 0L1 0L0 1").transform(attr).iterate((seg) => pts.push(+seg[1]!, +seg[2]!));
  if (pts.length !== 6) return IDENTITY;
  return [pts[2]! - pts[0]!, pts[3]! - pts[1]!, pts[4]! - pts[0]!, pts[5]! - pts[1]!, pts[0]!, pts[1]!];
}

export function bake(d: string, ctm: SvgMatrix): string {
  return isIdentity(ctm) ? d : svgpath(d).matrix(ctm).round(3).toString();
}

export function apply(m: SvgMatrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
