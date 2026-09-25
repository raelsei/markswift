/** SVG affine transforms and path transformation. */
import { type LayoutNode } from "../../model/layout.ts";
import { type SvgMatrix } from "./context.ts";
export declare const IDENTITY: SvgMatrix;
export declare function multiply(m: SvgMatrix, n: SvgMatrix): SvgMatrix;
export declare function isIdentity(m: SvgMatrix): boolean;
/**
 * The element's own transform: Chrome's computed `transform` (attribute and CSS alike, as a
 * matrix) about its `transform-origin`, in user units. Falls back to the attribute when the
 * snapshot carries no computed value.
 */
export declare function ownTransform(c: LayoutNode, notes: string[]): SvgMatrix;
/** SVG transform list (`rotate(30 50 40) translate(…)`) → matrix; svgpath parses the list, three probe points recover it. */
export declare function transformAttr(attr: string | undefined): SvgMatrix;
export declare function bake(d: string, ctm: SvgMatrix): string;
export declare function apply(m: SvgMatrix, x: number, y: number): [number, number];
