export interface FontToolResult {
    upem: number;
    ascent: number;
    descent: number;
    lineGap: number;
    useTypoMetrics: boolean;
    axes: Record<string, [number, number]>;
    converted: boolean;
    renamed: boolean;
    wrote: boolean;
}
export declare function runFontTool(src: string, dst: string, family: string, subfamily: string, rename: boolean): Promise<FontToolResult | string>;
