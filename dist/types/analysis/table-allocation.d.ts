import type { TableColumn } from "../model/table.ts";
/** CSS fixed layout: declared tracks first, remaining tracks share the unassigned space. */
export declare function allocateTableColumns(columns: TableColumn[], available: number): number[] | undefined;
