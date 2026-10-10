import type { SemNode, Edge, BorderStyle } from "../model/semantic.ts";
import type { ColorCtx } from "./context.ts";
import { colorExpr, dashPattern, num, strokeStyle } from "./format.ts";

/**
 * Per-edge borders. An edge whose two corners are both square is a bar aligned to that edge —
 * the cheapest thing that is also exact. An edge that runs into a rounded corner is not: CSS
 * curves the border itself around the corner and hands it over to the neighbouring side at the
 * line from the border-box corner to the padding-box corner, so an edge whose neighbour has no
 * border keeps the whole arc. Clipping a straight bar to the box shape instead *deletes* that
 * arc — and with it the only thing separating two `input-otp` slots. Those edges are emitted as
 * `MarkswiftBorderSides`, which builds exactly that region; one expression per colour/style/width
 * group, so at most four per node however large the design gets.
 */
export function borderSideModifiers(n: SemNode, ctx: ColorCtx): string[] {
  const sides = n.style.borderSides!;
  const r = n.style.radius ?? [0, 0, 0, 0];
  // Side i runs from corner i to corner i+1: top/trailing/bottom/leading against tl/tr/br/bl.
  const edges: Array<[Edge | undefined, string, "height" | "width"]> = [
    [sides.top, ".top", "height"],
    [sides.right, ".trailing", "width"],
    [sides.bottom, ".bottom", "height"],
    [sides.left, ".leading", "width"],
  ];
  const drawn = edges.map(([e], i) => (e && e.width > 0 && e.color.a > 0 ? i : -1)).filter((i) => i >= 0);
  if (!drawn.length) return [];
  const curved = drawn.some((i) => r[i]! > 0 || r[(i + 1) % 4]! > 0);
  if (!curved) return straightBorderSides(edges, n, ctx);

  // Every side's width, painted or not: the corner hand-over line is defined by both neighbours.
  const widths = `[${edges.map(([e]) => num(e?.width ?? 0)).join(", ")}]`;
  const radii = `[${r.map(num).join(", ")}]`;
  const groups: Array<{ key: string; color: string; style: BorderStyle; width: number; sides: number[] }> = [];
  for (const i of drawn) {
    const e = edges[i]![0]!;
    const color = colorExpr(e.color, ctx, n.id);
    const key = `${color}|${e.style}|${e.width}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.sides.push(i);
    else groups.push({ key, color, style: e.style, width: e.width, sides: [i] });
  }
  const m: string[] = [];
  for (const g of groups) {
    const head = `MarkswiftBorderSides(radii: ${radii}, widths: ${widths}, sides: [${g.sides.join(", ")}]`;
    const paint = (args: string) => m.push(`.overlay { ${head}${args}).fill(${g.color}) }`);
    switch (g.style) {
      // Two rules of a third of the width each, with a gap of a third between them.
      case "double":
        paint(`, band: 0...${num(1 / 3)}`);
        paint(`, band: ${num(2 / 3)}...1`);
        break;
      case "dashed":
        paint(`, dash: ${dashPattern("dashed", g.width)}`);
        break;
      case "dotted":
        paint(`, dash: ${dashPattern("dotted", g.width)}, roundCaps: true`);
        break;
      default:
        paint("");
    }
  }
  return m;
}

/** Square-cornered edges: a bar per edge, `double` two bars a third of the width each. */
function straightBorderSides(edges: Array<[Edge | undefined, string, "height" | "width"]>, n: SemNode, ctx: ColorCtx): string[] {
  const m: string[] = [];
  for (const [e, edge, dim] of edges) {
    if (!e || e.width <= 0 || e.color.a <= 0) continue;
    const color = colorExpr(e.color, ctx, n.id);
    const overlay = (view: string) => `.overlay(alignment: ${edge}) { ${view} }`;
    const bar = (thickness: number, inset = 0) => `Rectangle().fill(${color}).frame(${dim}: ${num(thickness)})${inset ? `.padding(${edge}, ${num(inset)})` : ""}`;
    switch (e.style) {
      case "double": {
        const t = e.width / 3;
        m.push(overlay(bar(t)), overlay(bar(t, e.width - t)));
        break;
      }
      case "dashed":
      case "dotted":
        m.push(overlay(`MarkswiftEdgeLine(edge: ${edge}).stroke(${color}, style: ${strokeStyle(e.width, e.style)}).frame(${dim}: ${num(e.width)})`));
        break;
      default:
        m.push(overlay(bar(e.width)));
    }
  }
  return m;
}
