import type { LayoutNode } from "../model/layout.ts";
import type { ControlNode, SelectRowAppearance } from "../model/semantic.ts";
import type { SourceOption } from "./select-input.ts";
export declare function selectRowAppearance(node: LayoutNode, height?: number): SelectRowAppearance | undefined;
export declare function selectGroupHeight(group: LayoutNode, options: SourceOption[]): number;
export declare function selectPaintRows(select: LayoutNode, options: SourceOption[], choices: NonNullable<ControlNode["choices"]>): ControlNode["selectRows"];
