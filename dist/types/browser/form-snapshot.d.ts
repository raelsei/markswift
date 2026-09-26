import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";
/** Live form semantics keyed by whole-document element paths in the snapshot tree. */
export interface FormSnapshot {
    radioOwners: Record<string, string>;
    hiddenOptions: Record<string, boolean>;
}
/** Read actual form association and popup visibility before the snapshot drops their context. */
export declare function readFormSnapshot(page: Page): Promise<FormSnapshot>;
/** Join live semantics before capture-root trimming or boxless descendants lose context. */
export declare function attachFormSnapshot(rawHtml: Raw, metadata: FormSnapshot): void;
