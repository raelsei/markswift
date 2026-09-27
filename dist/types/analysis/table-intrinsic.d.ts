/** Automatic tables whose whole cell strings have equal minimum/maximum content widths. */
import type { BundledFamilies } from "../model/fonts.ts";
import type { TableIntrinsicCell } from "../model/table.ts";
import type { TableStructure } from "./table-structure.ts";
export interface IntrinsicTableProof {
    cells: TableIntrinsicCell[];
    browserMaximums: number[];
}
export declare function intrinsicTableCells(structure: TableStructure, collapsed: boolean, families: BundledFamilies, decline: (reason: string) => undefined): IntrinsicTableProof | undefined;
/** CSS Tables 3 excess-width distribution for unconstrained columns with min=max. */
export declare function allocateIntrinsicTableColumns(maximums: number[], available: number): number[];
