import type { LayoutNode, Rect } from "../model/layout.ts";
import type { SemBase, StackNode, SvgNode } from "../model/semantic.ts";
/** Blink ListMarker::RelativeSymbolMarkerRect, horizontal LTR, in the measured marker box.
 * Primary sources: chromium core/layout/list/list_marker.cc and paint/text_fragment_painter.cc.
 */
export declare function markerPaintRect(n: LayoutNode): Rect | undefined;
export declare function buildListSymbol(n: LayoutNode, base: SemBase): SvgNode | undefined;
/** An inside shape and text occupy font boxes within the host's CSS line box. */
export declare function preserveSymbolLineLeading(n: LayoutNode, stack: StackNode): void;
