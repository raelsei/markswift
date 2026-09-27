import type { InlineContentToken } from "../model/inline-content-flow.ts";
import type { TextNode } from "../model/semantic.ts";
import type { TextInstrumentation } from "./text-observation.ts";
/** An alternate actual emission of the same exact node, never an ID/string alias. */
export declare function inlineCaptionKeys(node: TextNode, tokens: InlineContentToken[], state?: TextInstrumentation): string[];
