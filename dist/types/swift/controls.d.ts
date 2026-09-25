import type { ControlNode, SemNode } from "../model/semantic.ts";
import type { EmitMode } from "./context.ts";
import { type ScreenTokens } from "./format.ts";
/** What the emitter must be able to do with a control's children and label. */
export interface ControlDeps {
    /** Emits a child node the way the surrounding view would (containers → their property). */
    child: (n: SemNode) => string[];
    /** Control → `@State` property name; built by `controlMembers`. */
    stateOf: Map<SemNode, string>;
    /** `onclick` source → callback property name; built by `controlMembers`. */
    actionOf: Map<string, string>;
    mode: EmitMode;
    /** The screen's colour scheme: `<progress>`/`<meter>`/`<input type=range>` are painted by the browser, whose palette follows it. */
    theme: "light" | "dark";
    /** This screen's colour → token lookup, and the control node its colours belong to. */
    tokens?: ScreenTokens;
    id?: string;
}
export declare function controlExpr(n: ControlNode, deps: ControlDeps): string[];
export { controlMembers, type ControlMembers } from "./control-state.ts";
export { CONTROL_RUNTIME } from "./control-runtime.ts";
