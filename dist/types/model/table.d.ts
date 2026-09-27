import type { FontSpec } from "./semantic.ts";
import type { Rect } from "./layout.ts";
/** Declared table allocation, independent of the measured column ratios. */
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
    /** Intrinsic padded text box, distinct from the allocated cell's painted rectangle. */
    contentFrame?: Rect;
    section?: "thead" | "tbody" | "tfoot";
}
/** Children and placements correspond by index; paint layers precede accessible cells. */
export interface TableLayout {
    /** Omitted for older fixed-table models. */
    mode?: "fixed" | "auto";
    /** Whole nonbreaking cell strings; native font advances supply min=max content widths. */
    intrinsic?: TableIntrinsicCell[];
    columns: TableColumn[];
    placements: TablePlacement[];
    rowMinimums: number[];
    spacing: [number, number];
    insets: [number, number, number, number];
    captionSide?: "top" | "bottom";
    captionMargins?: [number, number];
}
export interface TableIntrinsicCell {
    column: number;
    text: string;
    font: FontSpec;
    horizontalInset: number;
}
