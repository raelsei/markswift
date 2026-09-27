/**
 * HTML controls → `ControlNode`. Tag plus attributes decide *what* the element is; the measured
 * box, padding and paint still come from the generic inference pass, so a control looks exactly
 * like the box it replaced and only gains its interactive core.
 *
 * Tags and attributes determine control identity. Select metadata also retains measured row paint;
 * `input[type=range]` remains a slider however the design paints it.
 */
import type { LayoutNode } from "../model/layout.ts";
import type { Color } from "../css/index.ts";
import type { ControlKind, ControlNode, FontSpec, SemBase, SemNode, TextTransform } from "../model/semantic.ts";
/** `controlOf`'s answer: which control an element is, with the attribute state the design shows. */
export interface ControlSpec {
    control: ControlKind;
    value?: string;
    captionTransform?: TextTransform;
    placeholder?: string;
    checked?: boolean;
    radioGroup?: string;
    disabled?: boolean;
    readOnly?: boolean;
    dateKind?: ControlNode["dateKind"];
    dateComponents?: ControlNode["dateComponents"];
    range?: {
        min: number;
        max: number;
        step?: number;
    };
    level?: ControlNode["level"];
    options?: string[];
    choices?: ControlNode["choices"];
    selectedChoice?: number;
    selectList?: ControlNode["selectList"];
    selectedChoices?: number[];
    selectRows?: ControlNode["selectRows"];
    selectStatic?: boolean;
    href?: string;
    action?: string;
    expanded?: boolean;
    disclosureLayout?: ControlNode["disclosureLayout"];
    files?: ControlNode["files"];
    /** Losses to record on the node (a link with no runtime destination, an unsupported input type). */
    notes: string[];
}
/**
 * The control this element is, or `undefined` when it is an ordinary box. Attribute-only: the
 * caller supplies the measured base and rendered children. Select choices carry their own rows.
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
