import type { DomSnapshot, Raw } from "./snapshot-types.ts";
interface SourceVisibility {
    name: string;
    value: string;
}
export type SourceContentVisibility = ReadonlyMap<number, SourceVisibility>;
/** A one-property snapshot before settle overrides; only measured, unique real DOM objects qualify. */
export declare function readSourceContentVisibility(snapshot: DomSnapshot): SourceContentVisibility;
/** Backend IDs identify DOM objects across snapshots; markup and ordinal similarity are insufficient. */
export declare function attachSourceContentVisibility(tree: Raw, source: SourceContentVisibility, forced?: SourceContentVisibility): void;
export declare function contentVisibilityWarnings(root: Raw): string[];
export {};
