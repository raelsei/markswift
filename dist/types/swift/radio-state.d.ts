import type { ControlNode, SemNode } from "../model/semantic.ts";
interface RadioGroup {
    owner: ControlNode;
    selected?: number;
}
interface RadioMember {
    group: RadioGroup;
    choice: number;
}
/** DOM grouping comes from analysis; native choices use identity, never duplicate HTML ids/values. */
export declare function radioMembers(root: SemNode): Map<SemNode, RadioMember>;
/** Radio activation only selects; ToggleStyle's attempt to clear an active radio is ignored. */
export declare function radioBinding(state: string, choice: number, disabled?: boolean): string;
export {};
