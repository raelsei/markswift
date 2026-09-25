/** Build semantic SVG nodes from measured layout trees. */
import { type LayoutNode } from "../../model/layout.ts";
import { type SemBase, type SvgNode } from "../../model/semantic.ts";
import { type BundledFamilies } from "../../model/fonts.ts";
/** Build the SvgNode for `n` on top of an already-measured `base` (frame, style, padding). `doc` is the document root used to resolve `#id` references. */
export declare function buildSvg(n: LayoutNode, base: SemBase, doc?: LayoutNode, bundledFamilies?: BundledFamilies): SvgNode;
