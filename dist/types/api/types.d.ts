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
