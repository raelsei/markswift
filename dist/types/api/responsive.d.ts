import type { HtmlSource } from "../input/types.ts";
import type { ResponsiveConversionResult, ResponsiveConvertOptions } from "./types.ts";
/** Capture two explicit CSS viewport states and compile one responsive SwiftUI view. */
export declare function convertResponsive(source: HtmlSource, options: ResponsiveConvertOptions): Promise<ResponsiveConversionResult>;
