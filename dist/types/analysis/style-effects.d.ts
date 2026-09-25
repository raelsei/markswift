/** Visual effects, clipping, visibility and design-token hints. */
import type { LayoutNode } from "../model/layout.ts";
import type { Style } from "../model/semantic.ts";
export declare function applyEffects(n: LayoutNode, style: Style, notes: string[]): void;
/** A browser snapshot carries one settled frame, never the CSS timeline or a future state change. */
export declare function reportStaticMotion(styles: Record<string, string>, note: (message: string) => void): void;
