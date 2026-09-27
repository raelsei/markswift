export interface FontToolResult {
    upem: number;
    ascent: number;
    descent: number;
    lineGap: number;
    useTypoMetrics: boolean;
    axes: Record<string, [number, number]>;
    axisDefaults?: Record<string, number>;
    converted: boolean;
    renamed: boolean;
    wrote: boolean;
    postScriptName?: string;
}
export declare function runFontTool(src: string, dst: string, family: string, subfamily: string, rename: boolean): Promise<FontToolResult | string>;
