/** Compile several captured components into one Swift target and one shared helper set. */
import { LayoutDoc } from "../model/layout.ts";
import type { CompileOptions, CompileResult } from "./index.ts";
export interface CompileLayoutInput extends CompileOptions {
    layout: LayoutDoc;
    /** Every view in the target needs a distinct Swift type and output filename. */
    name: string;
    /** Shared identity for light/dark captures of one component; defaults to the view name. */
    componentId?: string;
    /** Additional generated sources, such as Font+Markswift.swift or a plist fragment. */
    supportFiles?: Record<string, string>;
    /** Binary resources, such as packaged font files under Fonts/. */
    assets?: Record<string, Uint8Array>;
}
export interface CompileBatchResult {
    /** One Swift file per view, plus one runtime, token file and shape file. */
    files: Record<string, string>;
    /** Deduplicated binary resources for the same Swift target. */
    assets: Record<string, Uint8Array>;
    views: Array<Omit<CompileResult, "files">>;
}
/**
 * A shared color-token pass keeps distinct views from defining the same Swift token name with
 * different values. Font packaging stays with the caller, as it does for compileLayout; supplied
 * support files and assets are deduplicated only when their names and contents agree exactly.
 */
export declare function compileLayouts(inputs: readonly CompileLayoutInput[]): CompileBatchResult;
