import type { DomSnapshot, Raw } from "./snapshot-types.ts";
/** Decode laid-out styles and geometry; untransformed boxes override painted bounds. */
export declare function attachLayoutColumns(doc: DomSnapshot["documents"][number], raws: Raw[], strings: string[], boxes?: DomSnapshot): void;
