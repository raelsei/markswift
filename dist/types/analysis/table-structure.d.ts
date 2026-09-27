/** HTML table slots and spans; cell coordinates are checked separately against geometry. */
import type { LayoutNode } from "../model/layout.ts";
import type { TablePlacement } from "../model/table.ts";
export interface TableMember {
    node: LayoutNode;
    placement: TablePlacement;
    parent?: LayoutNode;
}
export interface TableStructure {
    rows: Array<{
        node: LayoutNode;
        group?: LayoutNode;
    }>;
    columns: LayoutNode[];
    caption?: LayoutNode;
    placed: TableMember[];
    count: number;
}
export declare function readTableStructure(table: LayoutNode, decline: (reason: string) => undefined): TableStructure | undefined;
