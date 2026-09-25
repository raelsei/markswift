import { STYLE_WHITELIST } from "../model/layout.ts";
import type { DomSnapshot, Raw } from "./snapshot-types.ts";
import { assignLineBoxes, pseudoBox } from "./snapshot-geometry.ts";

/** Decode laid-out styles and geometry; untransformed boxes override painted bounds. */
export function attachLayoutColumns(doc: DomSnapshot["documents"][number], raws: Raw[], strings: string[], boxes?: DomSnapshot): void {
  const L = doc.layout;
  for (let li = 0; li < L.nodeIndex.length; li++) {
    const r = raws[L.nodeIndex[li]!]!;
    const b = L.bounds[li]!;
    r.bounds = { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! };
    const o = L.offsetRects?.[li];
    if (o) r.offset = { x: o[0]!, y: o[1]!, w: o[2]!, h: o[3]! };
    const sv = L.styles[li] ?? [];
    for (let k = 0; k < STYLE_WHITELIST.length; k++) {
      const v = sv[k];
      if (v !== undefined && v >= 0) r.styles[STYLE_WHITELIST[k]!] = strings[v]!;
    }
    const t = L.text[li];
    // Text nodes keep their DOM value (untransformed); generated content only exists as laid-out text.
    if (r.type === 3) r.text = r.value.trim() ? r.value : t !== undefined && t >= 0 ? strings[t]! : "";
    else if (r.pseudo) r.text = t !== undefined && t >= 0 ? strings[t]! : "";
    if (L.paintOrders) r.paint = L.paintOrders[li];
  }
  const LB = boxes?.documents[0]?.layout;
  if (LB) {
    for (let li = 0; li < LB.nodeIndex.length; li++) {
      const r = raws[LB.nodeIndex[li]!];
      const b = LB.bounds[li];
      if (r && b) r.bounds = { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! };
      const o = LB.offsetRects?.[li];
      if (r && o) r.offset = { x: o[0]!, y: o[1]!, w: o[2]!, h: o[3]! };
    }
  }
  // Line boxes: from the untransformed snapshot when there is one, so a rotated paragraph's
  // lines are its layout lines (transforms never affect line breaking).
  assignLineBoxes(boxes?.documents[0] ?? doc, raws);
  const pseudo = doc.nodes.pseudoType;
  if (pseudo) for (const i of pseudo.index) raws[i]!.box = pseudoBox(raws[i]!);
}
