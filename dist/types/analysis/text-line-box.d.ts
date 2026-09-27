/** A measured line box only when every glyph run shares one supported native font. */
import type { LayoutNode } from "../model/layout.ts";
import type { TextNode, TextLineBox } from "../model/semantic.ts";
import type { MeasuredTextRun, SourceTextRun } from "./context.ts";
/** Preserve absolute baselines when a caption adopts its containing CSS content box. */
export declare function reframeText(node: TextNode, frame: TextNode["frame"]): void;
export declare function measuredTextLineBox(host: LayoutNode, node: TextNode, built: MeasuredTextRun[], sources?: SourceTextRun[], note?: (message: string) => void): TextLineBox | undefined;
