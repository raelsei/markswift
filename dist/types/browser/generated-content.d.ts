import type { Raw } from "./snapshot-types.ts";
/** A lone CSS `url(...)` is a drawable replaced image; mixed content needs a richer model. */
export declare function singleGeneratedImageUrl(content: string): string | undefined;
/** Report image content that cannot be represented as one drawable source. */
export declare function generatedContentWarnings(root: Raw): string[];
