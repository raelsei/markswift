import type { Rect } from "../model/layout.ts";
import type { DomSnapshot, Raw } from "./snapshot-types.ts";
/**
 * `textBoxes` → `Raw.lines`. One entry per laid-out inline text box, i.e. per line the browser
 * broke the text node into (a `<br>`-free paragraph of one line has exactly one). `layoutIndex`
 * points into the layout arrays, so the owning text node is `nodes.nodeIndex[layoutIndex]`.
 * `start`/`length` are UTF-16 offsets into the node's laid-out text, which is what makes the
 * browser's line division reproducible downstream.
 */
export declare function assignLineBoxes(document: DomSnapshot["documents"][number], raws: Raw[]): void;
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
export declare function pseudoBox(raw: Raw): Rect | undefined;
export declare function rebase(b: Rect, o: {
    x: number;
    y: number;
}): Rect;
