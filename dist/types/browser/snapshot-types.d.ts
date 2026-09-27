import type { LayoutNode, Rect } from "../model/layout.ts";
/** CDP `RareStringData`: sparse per-node strings (`value[k]` belongs to node `index[k]`). */
interface RareStringData {
    index: number[];
    value: number[];
}
/** CDP `RareBooleanData`: an index appears only when its current state is true. */
interface RareBooleanData {
    index: number[];
}
/** Subset of the CDP response we read. */
export interface DomSnapshot {
    documents: Array<{
        documentURL: number;
        nodes: {
            nodeType: number[];
            nodeName: number[];
            nodeValue: number[];
            parentIndex: number[];
            attributes: number[][];
            /** `before` / `after` / `marker` / … for pseudo-element nodes. */
            pseudoType?: RareStringData;
            /** Shadow-tree provenance; CDP flattens the root itself out of the node tree. */
            shadowRootType?: RareStringData;
            /** `img.currentSrc` (absolute URL) for every `<img>`. */
            currentSourceURL?: RareStringData;
            /** Live form properties, separate from the often-stale authored attributes. */
            inputValue?: RareStringData;
            textValue?: RareStringData;
            inputChecked?: RareBooleanData;
            optionSelected?: RareBooleanData;
        };
        layout: {
            nodeIndex: number[];
            styles: number[][];
            bounds: number[][];
            text: number[];
            paintOrders?: number[];
            /** `offsetLeft/Top/Width/Height` per laid-out node (`includeDOMRects`). */
            offsetRects?: number[][];
        };
        textBoxes: {
            layoutIndex: number[];
            bounds: number[][];
            start: number[];
            length: number[];
        };
    }>;
    strings: string[];
}
export interface Raw {
    idx: number;
    type: number;
    name: string;
    value: string;
    attrs: Record<string, string>;
    styles: Record<string, string>;
    preferredSize?: LayoutNode["preferredSize"];
    markerLayout?: LayoutNode["markerLayout"];
    inlineStrut?: LayoutNode["inlineStrut"];
    inlineControlMargins?: LayoutNode["inlineControlMargins"];
    formOwner?: LayoutNode["formOwner"];
    selectedIndex?: LayoutNode["selectedIndex"];
    option?: LayoutNode["option"];
    /** Snapshot bounds: border box for elements, line-box union for inline/text, the generated text's box for pseudo-elements. */
    bounds?: Rect;
    /** CSSOM offset rect (relative to the offsetParent's padding edge). */
    offset?: Rect;
    /** `before` / `after` / `marker` for pseudo-element nodes. */
    pseudo?: string;
    /** The DOM tree containing this node: `open`, `closed`, or `user-agent` shadow root. */
    shadowRootType?: string;
    /** Pseudo-elements only: border box derived from `offset` (see `pseudoBox`). */
    box?: Rect;
    /** Text nodes: measured line boxes (`textBoxes`), in layout order; `start`/`length` index `text`. */
    lines?: Array<{
        bounds: Rect;
        start: number;
        length: number;
        baseline?: number;
    }>;
    text?: string;
    textSource?: LayoutNode["textSource"];
    textSourceCapture?: LayoutNode["textSourceCapture"];
    firstBaseline?: number;
    paint?: number;
    parent?: Raw;
    children: Raw[];
}
export {};
