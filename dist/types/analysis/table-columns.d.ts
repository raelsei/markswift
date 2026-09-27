/** Width intent and first-row precedence for the admitted fixed-table subset. */
import type { LayoutNode } from "../model/layout.ts";
import type { TableColumn } from "../model/table.ts";
import type { TableMember } from "./table-structure.ts";
export declare function declaredTableColumns(columns: LayoutNode[], count: number, placed: TableMember[], collapsed: boolean, gap: number[], decline: (reason: string) => undefined): TableColumn[] | undefined;
export declare function intent(node: LayoutNode, axis?: "width" | "height"): string;
export declare function span(value: string | undefined, limit: number, zero?: boolean): number | undefined;
export declare function spacing(value: string | undefined): number[] | undefined;
export declare function ordinary(node: LayoutNode): boolean;
export declare function unconstrained(node: LayoutNode): boolean;
export declare function close(a: number, b: number): boolean;
