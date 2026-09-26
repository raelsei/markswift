import type { Raw } from "./snapshot-types.ts";
/** Preserve select semantics before unmeasured option descendants are discarded. */
export declare function attachSelectMetadata(nodes: Raw[], liveSelection: boolean): void;
