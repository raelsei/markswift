/** Declared fixed-table allocation, independent of the measured column ratios. */
export interface TableColumn {
    kind: "fixed" | "fraction" | "auto";
    value?: number;
    /** Content-box cell padding and resolved border contribution, in CSS pixels. */
    extra?: number;
}
export interface TablePlacement {
    kind: "body" | "cell" | "row" | "section" | "caption";
    row: number;
    column: number;
    rowSpan: number;
    columnSpan: number;
    header?: boolean;
    label?: string;
    alignment?: "top" | "center" | "bottom";
    section?: "thead" | "tbody" | "tfoot";
}
/** Children and placements correspond by index; paint layers precede accessible cells. */
export interface TableLayout {
    columns: TableColumn[];
    placements: TablePlacement[];
    rowMinimums: number[];
    spacing: [number, number];
    insets: [number, number, number, number];
    captionSide?: "top" | "bottom";
    captionMargins?: [number, number];
}
