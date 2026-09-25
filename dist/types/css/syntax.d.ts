/** Pure syntax interpretation of browser-resolved CSS values. */
export declare function px(s: string | undefined): number;
/** Declared inline style → property map (lower-cased names, trimmed values). */
export declare function parseDeclared(style: string | undefined): Record<string, string>;
/** Split on `sep` at paren depth 0 (for comma-separated lists containing function calls). */
export declare function splitTop(s: string, sep: string): string[];
/**
 * `<length-percentage>` → px against `ref`: `12px`, `50%`, `0`, or a linear
 * `calc(100% - 10px)` mixing px and % terms. Unknown units → undefined.
 */
export declare function resolveLength(t: string, ref: number): number | undefined;
export declare function round2(v: number): number;
