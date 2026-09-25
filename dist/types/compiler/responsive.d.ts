/** Compile two viewport captures into one width-selecting SwiftUI view. */
import { LayoutDoc } from "../model/layout.ts";
import type { FaceMetrics, BundledFamily } from "../model/fonts.ts";
import type { EmitMode } from "../swift/emit.ts";
import { type CompileBatchResult } from "./batch.ts";
export interface ResponsiveCapture {
    layout: LayoutDoc;
    /** CSS viewport width used for this capture, which may differ from the captured root width. */
    viewportWidth: number;
}
export interface CompileResponsiveOptions {
    name: string;
    /** Inclusive upper width of the compact branch, in CSS points. */
    breakpoint: number;
    compact: ResponsiveCapture;
    regular: ResponsiveCapture;
    mode?: EmitMode;
    bundledFamilies?: Record<string, BundledFamily>;
    fontMetrics?: Record<string, FaceMetrics>;
    supportFiles?: Record<string, string>;
    assets?: Record<string, Uint8Array>;
}
/** Alias for callers that treat a responsive pair as one compiler input. */
export type CompileResponsiveInput = CompileResponsiveOptions;
export interface CompileResponsiveResult extends CompileBatchResult {
    name: string;
    /** Source of the public wrapper view, also present in files[`${name}.swift`]. */
    code: string;
}
export declare function compileResponsiveLayouts(options: CompileResponsiveInput): CompileResponsiveResult;
