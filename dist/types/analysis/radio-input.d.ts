import type { LayoutNode } from "../model/layout.ts";
import type { ControlSpec } from "./controls.ts";
/** HTML groups use exact nonempty names and actual form ownership, independent of rendered wrappers. */
export declare function applyRadioInput(node: LayoutNode, spec: ControlSpec): void;
