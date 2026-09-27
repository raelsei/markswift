/** Column, section and row backgrounds remain below the accessible spanning cells. */
import type { LayoutNode } from "../model/layout.ts";
import type { TableLayout } from "../model/table.ts";
import type { TableMember, TableStructure } from "./table-structure.ts";
export declare function tableLayers(table: LayoutNode, structure: TableStructure, insets: TableLayout["insets"], widths: number[], gap: number[], bodyTop: number, bodyBottom: number): TableMember[];
