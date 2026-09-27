import type { CDPSession, Page } from "playwright-core";
import type { SourceContentVisibility } from "./content-visibility.ts";
/** Public CDP identities prevent stale pre-settle values from authorizing rewritten nodes. */
export declare function settleVisibility(page: Page, cdp?: CDPSession): Promise<SourceContentVisibility>;
