import type { HtmlSource } from "../input/types.ts";
import type { ConvertOptions, ConversionResult } from "./types.ts";
/** Convert a document, fragment, HTML file or rendered URL through the same measured pipeline. */
export declare function convert(source: HtmlSource, options?: ConvertOptions): Promise<ConversionResult>;
/** Convenience entry point for pasted HTML. */
export declare function convertHtml(html: string, options?: ConvertOptions): Promise<ConversionResult>;
