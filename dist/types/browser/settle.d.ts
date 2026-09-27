import type { CDPSession, Page } from "playwright-core";
import type { SourceContentVisibility } from "./content-visibility.ts";
/**
 * Fonts loaded, animations finished, `hide` selectors hidden, one frame painted.
 * `content-visibility: auto` subtrees are forced to lay out (off-screen content
 * would otherwise be missing from the snapshot); the contents of
 * `content-visibility: hidden` elements (`hidden=until-found`) are removed from
 * layout because DOMSnapshot still reports boxes for them while nothing paints.
 */
export declare function settle(page: Page, hide: string[], beforeVisibility?: () => Promise<void>, cdp?: CDPSession): Promise<SourceContentVisibility>;
