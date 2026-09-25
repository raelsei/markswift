import type { Rect } from "../model/layout.ts";
import type { DomSnapshot, Raw } from "./snapshot-types.ts";

/**
 * `textBoxes` → `Raw.lines`. One entry per laid-out inline text box, i.e. per line the browser
 * broke the text node into (a `<br>`-free paragraph of one line has exactly one). `layoutIndex`
 * points into the layout arrays, so the owning text node is `nodes.nodeIndex[layoutIndex]`.
 * `start`/`length` are UTF-16 offsets into the node's laid-out text, which is what makes the
 * browser's line division reproducible downstream.
 */
export function assignLineBoxes(document: DomSnapshot["documents"][number], raws: Raw[]): void {
  const tb = document.textBoxes;
  const nodeIndex = document.layout.nodeIndex;
  for (let k = 0; k < tb.layoutIndex.length; k++) {
    const r = raws[nodeIndex[tb.layoutIndex[k]!]!];
    const b = tb.bounds[k];
    if (!r || !b) continue;
    (r.lines ??= []).push({ bounds: { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! }, start: tb.start[k]!, length: tb.length[k]! });
  }
}

/**
 * Border box of a pseudo-element. DOMSnapshot `bounds` for pseudo-elements is
 * the box of their generated text (empty for `content: ""`), so the box is
 * rebuilt from the CSSOM offset rect the way Chromium defines `offsetLeft/Top`:
 * relative to the padding edge of the nearest positioned ancestor (or
 * `table`/`td`/`th` for non-positioned pseudos), to the border-box origin of a
 * positioned `<body>`, or to the document origin for a static `<body>` /
 * `position: fixed`. Undefined when no offset rect or no offsetParent is known.
 * Offset rects are integer (CSSOM `long`), so the box is whole-px; the text
 * child keeps the fractional snapshot bounds.
 */
export function pseudoBox(raw: Raw): Rect | undefined {
  const o = raw.offset;
  if (!o) return undefined;
  const position = raw.styles["position"] ?? "static";
  if (position === "fixed") return { ...o };
  for (let a = raw.parent; a; a = a.parent) {
    if (!a.bounds) continue; // display: contents — no layout object, skipped by the layout-tree walk
    const positioned = (a.styles["position"] ?? "static") !== "static";
    if (a.name === "body") return positioned ? { x: a.bounds.x + o.x, y: a.bounds.y + o.y, w: o.w, h: o.h } : { ...o };
    if (positioned || (position === "static" && (a.name === "table" || a.name === "td" || a.name === "th"))) {
      const bl = parseFloat(a.styles["border-left-width"] ?? "") || 0;
      const bt = parseFloat(a.styles["border-top-width"] ?? "") || 0;
      return { x: a.bounds.x + bl + o.x, y: a.bounds.y + bt + o.y, w: o.w, h: o.h };
    }
  }
  return undefined;
}

export function rebase(b: Rect, o: { x: number; y: number }): Rect {
  return { x: round(b.x - o.x), y: round(b.y - o.y), w: round(b.w), h: round(b.h) };
}

const round = (v: number) => Math.round(v * 100) / 100;
