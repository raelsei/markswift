/** A narrow CSS identity: N equal border-box calc tracks plus pixel gaps fill each row. */
import type { LayoutNode } from "../model/layout.ts";
import type { SemBase, SemNode } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { parseDeclared, px } from "../css/syntax.ts";
import { insetsOf, EDGES } from "./geometry.ts";

const preferred = (node: LayoutNode, axis: "width" | "height") => node.preferredSize?.[axis] ?? parseDeclared(node.attrs.style)[axis];
const automatic = (value: string | undefined) => value === undefined || value === "auto";
const zeroMinimum = (value: string | undefined) => value === undefined || /^(?:auto|0(?:px)?)$/.test(value);

/** Descendant layout must already accept a narrower width and compute its content height. */
function fluidContent(node: SemNode): boolean {
  if (node.overlays.length || node.width.kind === "fixed" || node.maxHeight !== undefined) return false;
  if (node.style.mask || node.style.clipPath || node.style.transform || node.style.fills.some(fill => fill.kind !== "solid")) return false;
  if (node.kind === "text") return node.height.kind === "hug" && node.runs.every(run => run.paint === undefined);
  return node.kind === "stack" && node.axis === "v" && !node.measured && !node.wrap && !node.scroll
    && node.height.kind === "hug" && node.children.every(fluidContent);
}

export function equalWrappingColumns(n: LayoutNode, base: SemBase, items: AnalyzedChild[], columnGap: number | undefined): number | undefined {
  if (columnGap === undefined || items.length < 2 || !automatic(preferred(n, "height")) ||
      !zeroMinimum(n.styles["min-height"]) || (n.styles["max-height"] ?? "none") !== "none") return;
  const declaration = preferred(items[0]!.node, "width");
  const match = /^calc\(\s*(\d+(?:\.\d+)?)%\s*-\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(declaration ?? "");
  if (!match) return;
  const fraction = Number(match[1]) / 100, offset = Number(match[2]);
  const columns = Math.round(1 / fraction);
  if (columns < 2 || columns > items.length || Math.abs(columns * fraction - 1) > 0.00001 ||
      Math.abs(columns * offset - columnGap * (columns - 1)) > 0.001) return;
  const width = (base.frame.w - base.padding[1] - base.padding[3] - columnGap * (columns - 1)) / columns;
  if (!(width > 0)) return;
  for (const item of items) {
    const s = item.node.styles;
    if (preferred(item.node, "width") !== declaration || !automatic(preferred(item.node, "height")) ||
        s["box-sizing"] !== "border-box" || !zeroMinimum(s["min-width"]) || (s["max-width"] ?? "none") !== "none" ||
        (s["max-height"] ?? "none") !== "none" || !/^(?:auto|0|\d*\.?\d+px)$/.test(s["min-height"] ?? "auto") ||
        (s["aspect-ratio"] ?? "auto") !== "auto" || px(s["flex-grow"]) !== 0 || (s["flex-basis"] ?? "auto") !== "auto" ||
        (s.position ?? "static") !== "static" || (s.float ?? "none") !== "none" ||
        Math.abs(item.sem.frame.w - width) > 1 || EDGES.some(edge => Math.abs(px(s[`margin-${edge}`])) > 0.5)) return;
    // Plain card boxes and vertical text cards are bounded here; media/overlays and other
    // layouts can contain their own captured widths and need separate resize verification.
    if (item.sem.overlays.length || item.sem.style.mask || item.sem.style.clipPath || item.sem.style.transform ||
        item.sem.style.fills.some(fill => fill.kind !== "solid")) return;
    if (item.sem.kind !== "box" && !(item.sem.kind === "stack" && item.sem.axis === "v" &&
        !item.sem.measured && !item.sem.wrap && !item.sem.scroll && item.sem.children.every(fluidContent))) return;
    if (insetsOf(s)[1] + insetsOf(s)[3] >= width) return;
  }
  return columns;
}
