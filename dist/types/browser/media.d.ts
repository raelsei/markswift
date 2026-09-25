/** Media queries are browser-resolved at capture time, not reconstructed in SwiftUI. */
import type { Page } from "playwright-core";
/** Read accessible CSSOM, including imported sheets and media rules inside grouping rules. */
export declare function readMediaConditions(page: Page): Promise<string[]>;
/** One bounded warning keeps long compiled CSS from overwhelming conversion results. */
export declare function mediaWarning(conditions: readonly string[]): string | undefined;
