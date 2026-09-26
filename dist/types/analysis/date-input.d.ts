import type { LayoutNode } from "../model/layout.ts";
import type { ControlNode } from "../model/semantic.ts";
interface DateInputState {
    dateKind?: ControlNode["dateKind"];
    dateComponents?: ControlNode["dateComponents"];
    value?: string;
    readOnly?: boolean;
    notes: string[];
}
/** Keep date-family capture and native limitations separate from control dispatch. */
export declare function applyDateInput(node: LayoutNode, kind: NonNullable<ControlNode["dateKind"]>, spec: DateInputState): void;
export {};
