/** Synchronous compiler. No browser, filesystem, Python or Apple toolchain required. */
import { LayoutDoc } from "../model/layout.ts";
import { type EmitMode, type SwiftOutput } from "../swift/emit.ts";
import type { FaceMetrics, BundledFamily } from "../model/fonts.ts";
export interface CompileOptions {
    /** Complete Swift type name, e.g. ProfileCard. ASCII identifiers starting with uppercase. */
    name?: string;
    mode?: EmitMode;
    bundledFamilies?: Record<string, BundledFamily>;
    fontMetrics?: Record<string, FaceMetrics>;
    /** Verification-only passive SwiftUI frame observations. Omitted by default. */
    geometryInstrumentation?: boolean;
    /** Verification-only source claims and passive TextRenderer observation; opt-in. */
    textInstrumentation?: boolean;
}
export interface CompileResult {
    name: string;
    code: string;
    /** All Swift sources needed by this view, including shared runtime helpers. */
    files: Record<string, string>;
    diagnostics: SwiftOutput["report"];
    /** Emitted semantic nodes by mapping confidence; does not measure visual fidelity. */
    mapping: SwiftOutput["mapping"];
    geometry?: SwiftOutput["geometry"];
    text?: SwiftOutput["text"];
}
/** Compile a captured layout. Custom fonts must be packaged by the caller and passed explicitly. */
export declare function compileLayout(layout: LayoutDoc, options?: CompileOptions): CompileResult;
export type { LayoutDoc } from "../model/layout.ts";
export type { EmitMode } from "../swift/emit.ts";
export type { GeometryManifest, GeometryManifestNode } from "../swift/geometry-observation.ts";
export { compileLayouts } from "./batch.ts";
export type { CompileLayoutInput, CompileBatchResult } from "./batch.ts";
export { compileResponsiveLayouts } from "./responsive.ts";
export type { ResponsiveCapture, CompileResponsiveInput, CompileResponsiveOptions, CompileResponsiveResult } from "./responsive.ts";
