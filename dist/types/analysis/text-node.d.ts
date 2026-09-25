/** Finish the text box, measured line placement, overlays and overflow policy. */
import { type LayoutNode } from "../model/layout.ts";
import { type TextNode, type SemBase } from "../model/semantic.ts";
import { type SourceTextRun } from "./context.ts";
import { type BuiltTextRuns } from "./text-run-builder.ts";
export declare function finishTextNode(host: LayoutNode, runs: SourceTextRun[], base: SemBase, leaf: boolean, constructed: BuiltTextRuns, note: (s: string) => void): TextNode;
