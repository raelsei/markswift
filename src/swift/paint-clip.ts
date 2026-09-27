import type { Paint } from "../css/paint.ts";
import type { SemNode } from "../model/semantic.ts";
import { num } from "./format.ts";

/** CSS clipping changes visible alpha, independently of the background gradient's coordinates. */
export function backgroundClip(p: Paint, n: SemNode, shape: string, inset: string): string {
  const edges = p.kind !== "unsupported" ? p.inset : undefined;
  const radii = n.style.radius;
  if (edges && edges.some(value => value > 0) && edges.every(value => value === edges[0])
    && !n.style.ellipse && radii?.some(value => value > 0) && radii.every(value => value === radii[0])) {
    return `.mask { MarkswiftCSSInsetRoundClip(radius: ${num(radii[0])}, inset: ${num(edges[0])}) }`;
  }
  return inset ? `.mask { ${shape}${inset} }` : `.clipShape(${shape})`;
}
