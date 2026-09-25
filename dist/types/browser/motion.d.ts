/** CSS motion facts that must survive a stable, static browser capture. */
import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";
/** Remember effective transitions before the capture harness suppresses interpolation. */
export declare function readTransitionProperties(page: Page, selector: string): Promise<Record<string, string>>;
/** DOMSnapshot saw transition-property:none; restore authored computed values by element path. */
export declare function restoreTransitionProperties(root: Raw, properties: Record<string, string>): void;
/** Declarations may be dormant (e.g. `.card.flash`), so report them without blaming a node. */
export declare function readKeyframeNames(page: Page): Promise<string[]>;
