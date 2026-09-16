import type { Paint, Transform2D } from "../css/index.ts";
import type { SemNode, Filter, ClipShape } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { Writer, colorExpr, hash, indent, num, type ColorCtx } from "./format.ts";
import { note } from "./diagnostics.ts";
import { paintExpr } from "./paint.ts";
import { imageLayer } from "./images.ts";

/**
 * Skew has no SwiftUI modifier, so a sheared transform is emitted whole: the `Transform2D`
 * composition `translate · rotate · skewX · skewY · scale`, conjugated by the CSS
 * transform-origin (`T(o) · M · T(−o)`, `o` relative to the node's top-left, default centre)
 * because `.transformEffect` is applied about the view's own origin. CGAffineTransform's
 * `(a, b, c, d, tx, ty)` is the CSS `matrix()` layout, so the components map 1:1.
 */
export function affineModifier(t: Transform2D & { origin?: [number, number] }, w: number, h: number): string {
  const rad = Math.PI / 180;
  const cos = Math.cos(t.rotate * rad), sin = Math.sin(t.rotate * rad);
  const kx = Math.tan((t.skewX ?? 0) * rad), ky = Math.tan((t.skewY ?? 0) * rad);
  // Column-vector 2×2 as `[a, b, c, d]` (x' = a·x + c·y, y' = b·x + d·y); P·Q composes P after Q.
  const mul = (p: number[], q: number[]) => [p[0]! * q[0]! + p[2]! * q[1]!, p[1]! * q[0]! + p[3]! * q[1]!, p[0]! * q[2]! + p[2]! * q[3]!, p[1]! * q[2]! + p[3]! * q[3]!];
  const [a, b, c, d] = mul(mul(mul([cos, sin, -sin, cos], [1, 0, kx, 1]), [1, ky, 0, 1]), [t.scaleX, 0, 0, t.scaleY]) as [number, number, number, number];
  const ox = t.origin ? t.origin[0] : w / 2, oy = t.origin ? t.origin[1] : h / 2;
  const tx = t.tx + ox - (a * ox + c * oy), ty = t.ty + oy - (b * ox + d * oy);
  return `.transformEffect(CGAffineTransform(a: ${num(a)}, b: ${num(b)}, c: ${num(c)}, d: ${num(d)}, tx: ${num(tx)}, ty: ${num(ty)}))`;
}

/** One CSS `filter` function → SwiftUI modifier(s); lossy cases are noted on the node. */
export function filterModifier(f: Filter, n: SemNode, ctx: ColorCtx): string[] {
  switch (f.kind) {
    case "blur":
      return [`.blur(radius: ${num(f.radius)})`];
    case "drop-shadow": {
      const s = f.shadow;
      return s.color.a > 0 ? [`.shadow(color: ${colorExpr(s.color, ctx, n.id)}, radius: ${num(s.blur / 2)}, x: ${num(s.x)}, y: ${num(s.y)})`] : [];
    }
    case "grayscale":
      return [`.grayscale(${num(f.amount)})`];
    case "brightness":
      // CSS multiplies the channels, SwiftUI adds: neutral is 1 there and 0 here.
      return [`.brightness(${num(f.amount - 1)})`];
    case "contrast":
      return [`.contrast(${num(f.amount)})`];
    case "saturate":
      return [`.saturation(${num(f.amount)})`];
    case "opacity":
      return [`.opacity(${num(f.amount)})`];
    case "hue-rotate":
      return [`.hueRotation(.degrees(${num(f.degrees)}))`];
    case "invert":
      if (f.amount !== 0 && f.amount !== 1) note(n, `approximated: filter invert(${num(f.amount)}) is all-or-nothing on iOS`);
      return f.amount >= 0.5 ? [".colorInvert()"] : [];
    case "sepia": {
      // Sepia is a colour matrix; desaturate + multiply by the matrix's tint of white, faded by the amount.
      const tint = [1, 0.89, 0.694].map((c) => 1 - f.amount * (1 - c)) as [number, number, number];
      note(n, "approximated: filter sepia() as desaturation + warm tint");
      return [`.saturation(${num(1 - f.amount)})`, `.colorMultiply(Color.markswift(${num(tint[0])}, ${num(tint[1])}, ${num(tint[2])}))`];
    }
  }
}

/**
 * `clip-path` basic shapes. Circle/ellipse are placed with `.size().offset()` in measured px
 * (a centred full circle is just `Circle()`); inset masks with a padded rounded rectangle so it
 * follows the box; polygons become a generated `Shape` in fractions of the measured box.
 */
export function clipPathModifier(c: ClipShape, n: SemNode, ctx: EmitContext): string {
  const w = n.frame.w, h = n.frame.h;
  switch (c.kind) {
    case "circle": {
      const full = Math.abs(c.cx - w / 2) < 0.5 && Math.abs(c.cy - h / 2) < 0.5 && Math.abs(c.r - Math.min(w, h) / 2) < 0.5;
      return full ? ".clipShape(Circle())" : `.clipShape(Circle().size(width: ${num(2 * c.r)}, height: ${num(2 * c.r)}).offset(x: ${num(c.cx - c.r)}, y: ${num(c.cy - c.r)}))`;
    }
    case "ellipse":
      return `.clipShape(Ellipse().size(width: ${num(2 * c.rx)}, height: ${num(2 * c.ry)}).offset(x: ${num(c.cx - c.rx)}, y: ${num(c.cy - c.ry)}))`;
    case "inset": {
      const shape = c.radius ? `RoundedRectangle(cornerRadius: ${num(c.radius)}, style: .circular)` : "Rectangle()";
      return `.mask { ${shape}.padding(EdgeInsets(top: ${num(c.top)}, leading: ${num(c.left)}, bottom: ${num(c.bottom)}, trailing: ${num(c.right)})) }`;
    }
    case "polygon":
      return `.clipShape(${polygonShape(c.points.map(([x, y]) => [w ? x / w : 0, h ? y / h : 0]), ctx.shapes)}())`;
  }
}

/** One `Shape` struct per unique polygon (unit-square fractions); returns its name. */
function polygonShape(points: Array<[number, number]>, shapes: Record<string, string>): string {
  const pts = points.map(([x, y]) => [num(x), num(y)] as const);
  const name = "MarkswiftClip_" + hash(pts.map((p) => p.join(",")).join(" "));
  if (shapes[name]) return name;
  const w = new Writer();
  // `nonisolated`: see the SVG shapes — Shape conformance under MainActor default isolation.
  w.block(`nonisolated struct ${name}: Shape {`, () => {
    w.block("func path(in rect: CGRect) -> Path {", () => {
      w.line("func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + rect.width * x, y: rect.minY + rect.height * y) }");
      w.line("var p = Path()");
      pts.forEach(([x, y], i) => w.line(`p.${i === 0 ? "move" : "addLine"}(to: P(${x}, ${y}))`));
      w.line("p.closeSubpath()");
      w.line("return p");
    });
  });
  shapes[name] = w.toString();
  return name;
}

/** `mask-image`: the paint's alpha masks the node (gradients directly, images as a layer). */
export function maskModifier(p: Paint, n: SemNode, ctx: EmitContext): string[] {
  if (p.kind === "image") {
    const layer = imageLayer(p, n, "mask-image", ctx);
    return layer ? [".mask {", ...indent(layer, 1), "}"] : [];
  }
  if (p.kind === "unsupported") return [];
  // No node id: a mask is read for its alpha, and the extractor does not enumerate its
  // colours — a theme-adaptive token in a mask would change the shape of the mask, not a hue.
  return [`.mask { ${paintExpr(p, n.frame.w, n.frame.h, ctx)} }`];
}
