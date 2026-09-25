import type { Page } from "playwright-core";
import type { CompileOptions, CompileResult } from "../compiler/index.ts";
import type { Theme } from "../input/types.ts";
import type { LayoutDoc } from "../model/layout.ts";
export type { HtmlSource } from "../input/types.ts";
export interface ConvertOptions extends Pick<CompileOptions, "name" | "mode"> {
    /** Already compiled CSS. Utility and CSS Modules selectors work exactly like normal CSS. */
    css?: string;
    root?: string;
    theme?: Theme;
    viewport?: {
        width: number;
        height: number;
    };
    dpr?: number;
    /** Installed Playwright browser channel; defaults to chrome. */
    browserChannel?: string;
    /** For publicly submitted pasted markup: block page scripts and outbound resource requests. */
    untrustedInput?: boolean;
    /** Mounted selector to await before capture. */
    waitFor?: string;
    /** Optional application-specific setup, such as opening a menu or selecting a dark theme. */
    prepare?: (page: Page) => Promise<void>;
}
export interface ConversionResult extends CompileResult {
    /** Relative output paths -> bytes. Add these resources to the iOS target. */
    assets: Record<string, Uint8Array>;
    /** Font packaging limitations and browser resource/page errors. */
    warnings: string[];
    layout: LayoutDoc;
}
export interface ResponsiveConvertOptions extends Omit<ConvertOptions, "name" | "viewport"> {
    /** Public Swift view name for the two captured variants. */
    name: string;
    /** Inclusive upper width of the compact branch in SwiftUI points. */
    breakpoint: number;
    compact: {
        viewport: {
            width: number;
            height: number;
        };
    };
    regular: {
        viewport: {
            width: number;
            height: number;
        };
    };
}
export interface ResponsiveConversionResult {
    name: string;
    /** Swift source for the public responsive wrapper. */
    code: string;
    /** Wrapper, both captured views, and their shared Swift support sources. */
    files: Record<string, string>;
    /** Binary resources shared by both branches. */
    assets: Record<string, Uint8Array>;
    /** Mapping and diagnostics for each captured view; these are not visual-accuracy scores. */
    views: Array<Omit<CompileResult, "files">>;
    layouts: {
        compact: LayoutDoc;
        regular: LayoutDoc;
    };
    /** Deduplicated capture and font-packaging notes. See branchWarnings for capture provenance. */
    warnings: string[];
    /** Browser warnings for each viewport; a warning can occur in both branches. */
    branchWarnings: {
        compact: string[];
        regular: string[];
    };
}
