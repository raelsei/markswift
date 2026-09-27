/** Select choices retain identity, submitted value and display text as separate properties. */
import type { LayoutNode } from "../model/layout.ts";
import type { ControlSpec } from "./controls.ts";
export type SourceOption = {
    node: LayoutNode;
    disabled: boolean;
    hidden: boolean;
    group?: LayoutNode;
};
export declare function applySelectInput(node: LayoutNode, spec: ControlSpec): void;
