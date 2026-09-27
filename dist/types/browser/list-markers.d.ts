/** Default Blink marker shapes use primary-font metrics, not the generated text glyph. */
import type { CDPSession, Page } from "playwright-core";
import type { MarkerLayout } from "../model/layout.ts";
import type { Raw } from "./snapshot-types.ts";
export type MarkerLayouts = Record<string, MarkerLayout>;
export declare function readMarkerLayouts(page: Page, selector: string, cdp: CDPSession): Promise<MarkerLayouts>;
/** Join before display:contents flattening; pseudo nodes do not consume element ordinals. */
export declare function attachMarkerLayouts(root: Raw, layouts: MarkerLayouts): void;
