/** CSS box shadows paint the box silhouette, independently of its children and other shadows. */
import type { SemNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
/** Outer shadows sit behind the border box; their interior stays clear even with no fill. */
export declare function outerShadowModifiers(n: SemNode, ctx: EmitContext): string[];
/** Inset shadows are below content and above fills, clipped to the inner border edge. */
export declare function insetShadowModifiers(n: SemNode, ctx: EmitContext): string[];
