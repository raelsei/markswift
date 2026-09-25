/**
 * HTML controls → `ControlNode`. Tag plus attributes decide *what* the element is; the measured
 * box, padding and paint still come from the generic inference pass, so a control looks exactly
 * like the box it replaced and only gains its interactive core.
 *
 * Nothing here reads geometry: `input[type=range]` is a slider however the design paints it.
 */
import type { LayoutNode } from "../model/layout.ts";
import type { Color } from "../css/index.ts";
import type { ControlKind, ControlNode, FontSpec, SemBase, SemNode } from "../model/semantic.ts";
/** `controlOf`'s answer: which control an element is, with the attribute state the design shows. */
export interface ControlSpec {
    control: ControlKind;
    value?: string;
    placeholder?: string;
    checked?: boolean;
    disabled?: boolean;
    range?: {
        min: number;
        max: number;
        step?: number;
    };
    level?: ControlNode["level"];
    options?: string[];
    href?: string;
    action?: string;
    expanded?: boolean;
    files?: ControlNode["files"];
    /** Losses to record on the node (a link with no runtime destination, an unsupported input type). */
    notes: string[];
}
/**
 * The control this element is, or `undefined` when it is an ordinary box. Attribute-only: the
 * caller supplies the measured base and the built children.
 */
export declare function controlOf(n: LayoutNode): ControlSpec | undefined;
/** A control's laid-out surroundings, as the generic container path produced them. */
export interface ControlParts {
    /** The box the generic path would have painted: frame, padding, style, notes. */
    base: SemBase;
    /** Element children, in document order, already built. */
    children: Array<{
        node: LayoutNode;
        sem: SemNode;
    }>;
    /** The element's own text, one node per run group. */
    texts: SemNode[];
    /** Font and colour of the element's own text, for the value the control draws itself. */
    font?: FontSpec;
    color?: Color;
}
/**
 * The control node: `spec`'s attribute state on `parts.base`'s measured box. Children become
 * `content` in measured order (a `<summary>` becomes the disclosure's `label` instead).
 */
export declare function buildControl(spec: ControlSpec, parts: ControlParts): ControlNode;
