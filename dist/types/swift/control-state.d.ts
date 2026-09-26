import type { ControlNode, SemNode } from "../model/semantic.ts";
export type { ControlMembers } from "./context.ts";
import type { ControlMembers } from "./context.ts";
/**
 * Every control's state property and every distinct action callback for one screen. Names come
 * from the node ids, so regenerating an unchanged design produces the same members.
 */
export declare function controlMembers(root: SemNode, mode?: "app" | "fidelity"): ControlMembers;
/** The SwiftUI control itself; the caller appends the node's box modifiers. */
/** The control's value as a number, clamped into its range (the range's start when it has none). */
export declare function numericValue(n: ControlNode): number;
