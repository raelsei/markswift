/** CSS box shadows paint the box silhouette, independently of its children and other shadows. */
import type { SemNode, Style } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { colorExpr, indent, num } from "./format.ts";
import { shapeExpr } from "./paint.ts";

type Insets = [number, number, number, number];

/** Outer shadows sit behind the border box; their interior stays clear even with no fill. */
export function outerShadowModifiers(n: SemNode, ctx: EmitContext): string[] {
  const result: string[] = [];
  const box = shapeExpr(n.style, n.frame.w, n.frame.h);
  // The first CSS shadow is on top. Each subsequent background modifier goes farther back.
  for (const s of n.style.shadows.filter(s => !s.inset && s.color.a > 0)) {
    const silhouette = insetShape(n, [-s.spread, -s.spread, -s.spread, -s.spread]);
    const body = [
      "ZStack {",
      ...indent([
        `${silhouette}.fill(${colorExpr(s.color, ctx, n.id)})`,
        ...(s.spread ? [`.padding(${num(-s.spread)})`] : []),
        ...(s.blur ? [`.blur(radius: ${num(s.blur / 2)})`] : []),
        `.offset(x: ${num(s.x)}, y: ${num(s.y)})`,
        `${box}.fill(Color.black)`,
        ".blendMode(.destinationOut)",
      ], 1),
      "}",
      ".compositingGroup()",
    ];
    result.push(".background {", ...indent(body, 1), "}");
  }
  return result;
}

/** Inset shadows are below content and above fills, clipped to the inner border edge. */
export function insetShadowModifiers(n: SemNode, ctx: EmitContext): string[] {
  const result: string[] = [];
  const edge = borderInsets(n.style);
  const mask = `${insetShape(n, edge)}.fill(Color.black)${padding(edge)}`;
  for (const s of n.style.shadows.filter(s => s.inset && s.color.a > 0)) {
    const hole = edge.map(v => v + s.spread) as Insets;
    // A flood beyond the node models the infinite exterior of the inset shadow's hole.
    // Keep its edges farther away than the blur can reach, including shifted/expanded holes.
    const flood = Math.max(n.frame.w, n.frame.h) + Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.spread) + s.blur * 3;
    const body = [
      "ZStack {",
      ...indent([
        `Rectangle().fill(${colorExpr(s.color, ctx, n.id)}).padding(${num(-flood)})`,
        `${insetShape(n, hole)}.fill(Color.black)${padding(hole)}`,
        `.offset(x: ${num(s.x)}, y: ${num(s.y)})`,
        ".blendMode(.destinationOut)",
      ], 1),
      "}",
      ".compositingGroup()",
      ...(s.blur ? [`.blur(radius: ${num(s.blur / 2)})`] : []),
      ".mask(alignment: .center) {",
      ...indent([mask], 1),
      "}",
    ];
    result.push(".background {", ...indent(body, 1), "}");
  }
  return result;
}

function borderInsets(st: Style): Insets {
  if (st.border) return [st.border.width, st.border.width, st.border.width, st.border.width];
  const b = st.borderSides;
  return [b?.top?.width ?? 0, b?.right?.width ?? 0, b?.bottom?.width ?? 0, b?.left?.width ?? 0];
}

/** Uniform edges preserve CSS's circular radius; uneven edge ellipses retain a circular approximation. */
function insetShape(n: SemNode, inset: Insets): string {
  const [t, r, b, l] = inset;
  const st: Style = { ...n.style };
  if (st.radius) {
    const shrink = [Math.max(t, l), Math.max(t, r), Math.max(b, r), Math.max(b, l)];
    st.radius = st.radius.map((v, i) => v > 0 ? Math.max(0, v - shrink[i]!) : 0) as Insets;
  }
  return shapeExpr(st, Math.max(0, n.frame.w - l - r), Math.max(0, n.frame.h - t - b));
}

function padding(inset: Insets): string {
  const [t, r, b, l] = inset;
  if (t === 0 && r === 0 && b === 0 && l === 0) return "";
  return t === r && r === b && b === l
    ? `.padding(${num(t)})`
    : `.padding(EdgeInsets(top: ${num(t)}, leading: ${num(l)}, bottom: ${num(b)}, trailing: ${num(r)}))`;
}
