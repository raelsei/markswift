/** Ordered UTF16 claims follow text edits; inferred geometry never supplies source characters. */
import type { LayoutNode } from "../model/layout.ts";
import type { TextRunSource } from "../model/text-source.ts";
import type { Collapse } from "./text-runs.ts";
export declare function textSourceProjection(node: LayoutNode, text: string, indices: number[], mode: Collapse): TextRunSource | undefined;
/** The removed intervals stay explicit; retained output ranges become local to the sliced run. */
export declare function trimTextSource(source: TextRunSource, start: number, end: number): TextRunSource;
export declare function prependInferredSource(source: TextRunSource): TextRunSource;
export declare function omittedTextSource(node: LayoutNode): TextRunSource | undefined;
