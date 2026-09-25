import type { ElementPolicy } from "./types.ts";
/** WHATWG element index, checked 2026-09-16, including SVG and MathML entry points.
 * https://html.spec.whatwg.org/multipage/indices.html
 * Browser-computed display/geometry decides layout; these policies decide exceptional semantics.
 * "implemented" means a compiler path exists. CSS combinations, accessibility and behavior
 * require their own tests and are not established by this registry.
 */
export declare const HTML_ELEMENTS: Readonly<Record<string, ElementPolicy>>;
