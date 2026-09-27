/** Keep a cell's intrinsic content separate from its allocated row/span rectangle. */
import type { LayoutNode, Rect } from "../model/layout.ts";
import type { SemNode, TextNode } from "../model/semantic.ts";
export declare function tableCellInsets(node: LayoutNode, collapsed: boolean): SemNode["padding"];
/** Captured glyph boxes resolve normal only for one line; explicit CSS line height is authored. */
export declare function tableTextContentFrame(node: LayoutNode, text: TextNode, padding: SemNode["padding"]): Rect | undefined;
/** Captured centering slack is not authored padding or a first-child margin. */
export declare function restoreTableCellFlow(node: LayoutNode, content: SemNode, padding: SemNode["padding"]): void;
