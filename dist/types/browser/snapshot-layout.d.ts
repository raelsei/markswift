import type { LayoutNode } from "../model/layout.ts";
import type { NodeIdentity } from "../input/types.ts";
import type { PreferredSizes } from "./sizing.ts";
import type { Raw } from "./snapshot-types.ts";
/** Join CSS size intent while wrappers still exist, before display:contents is flattened. */
export declare function attachPreferredSizes(root: Raw, sizes: PreferredSizes): void;
export declare function findByAttr(root: Raw, attr: string, value: string): Raw | undefined;
export declare function findAll(root: Raw, pred: (r: Raw) => boolean, out?: Raw[]): Raw[];
/**
 * Convert the capture root to a LayoutNode tree, dropping nodes without
 * layout (display:none, <script>, comments, collapsed whitespace — a
 * whitespace-only text node that renders as an inter-run space is kept) and
 * rebasing bounds to `origin`. Element ids come from `identity`; `path` is the
 * element-index path of `raw` from the capture root ("" for the root itself,
 * then "0", "0/2", …) counting element children only.
 *
 * - `::before`/`::after`/`::marker` become element nodes with that tag, their
 *   computed styles, the derived border box and one `#text` child holding the
 *   generated text (counters/quotes already resolved by the browser), or one
 *   measured image child for a lone `content: url(...)`. `::after`
 *   is placed after the element's real children, the others before. They do
 *   not consume an element index; their path is `<parent path>/::before`.
 *   Empty ones (`content: ""` without a box) are dropped.
 * - An element without a layout box but with laid-out children
 *   (`display: contents`) is spliced out: its children join the parent's list
 *   in order; a custom wrapper's tag/id is recorded on the nearest measured
 *   ancestor for diagnostics. It still counts as an element in its children's
 *   paths so identity follows the DOM.
 * - `visibility: hidden` elements keep their box and are emitted like any
 *   other node; hiding is the inference pass's decision.
 */
export declare function toLayout(raw: Raw, origin: {
    x: number;
    y: number;
}, identity: NodeIdentity, path?: string): LayoutNode | undefined;
