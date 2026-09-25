/** Parse standalone SVG markup into layout data before SVG analysis. */
import { type Rect } from "../../model/layout.ts";
import { type SvgNode } from "../../model/semantic.ts";
/**
 * Standalone SVG markup (a `data:image/svg+xml` URL, an inline asset) → SvgNode drawn in
 * `frame`. Attributes only — there is no computed style — so `currentColor`, CSS classes
 * and `<style>` rules inside the markup are not resolved. Undefined when the root is not an
 * `<svg>` or no viewBox can be derived (neither `viewBox` nor width/height).
 */
export declare function svgFromMarkup(markup: string, frame: Rect): SvgNode | undefined;
