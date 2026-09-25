import type { HtmlSource } from "./types.ts";
export interface ResolvedSource {
    html?: string;
    url: string;
    label: string;
    close(): void | Promise<void>;
}
/** Resolve source-relative assets and own any temporary HTTP serving for this source. */
export declare function resolveSource(source: HtmlSource): Promise<ResolvedSource>;
