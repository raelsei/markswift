import { decompressFont } from "./decompress.ts";
import { assembleSfnt, buildRewrittenNameTable, extractFontMetrics, parseSfnt, readNameTable } from "./sfnt.ts";

export interface FontToolResult {
  upem: number;
  ascent: number;
  descent: number;
  lineGap: number;
  useTypoMetrics: boolean;
  axes: Record<string, [number, number]>;
  converted: boolean;
  renamed: boolean;
  /** Rewritten sfnt bytes; absent when the input already registers under `family` as-is. */
  bytes?: Uint8Array;
}

/** Decompress WOFF/WOFF2 and rewrite the name table so `family` resolves; a string is the failure reason. */
export type FontConverter = (
  bytes: Uint8Array,
  family: string,
  subfamily: string,
  signal?: AbortSignal,
) => Promise<FontToolResult | string>;

/** Pure TypeScript + WebAssembly font processor. Replaces Python/fontTools in-memory. */
export const nativeFontConverter: FontConverter = async (bytes, family, subfamily, signal) => {
  if (signal?.aborted) return "conversion aborted";
  try {
    const { bytes: decompressed, converted } = await decompressFont(bytes);
    if (signal?.aborted) return "conversion aborted";

    const sfnt = parseSfnt(decompressed);
    const nameTable = sfnt.tables.get("name");
    if (!nameTable) return "font missing name table";

    const { records, names } = readNameTable(nameTable.data);
    const existingNames = new Set(Array.from(names.values()).filter(Boolean));
    const wantRename = !existingNames.has(family);

    let finalBytes = decompressed;
    let renamed = false;

    if (wantRename) {
      const hasFvar = sfnt.tables.has("fvar");
      const newNameTable = buildRewrittenNameTable(records, family, subfamily, hasFvar);
      sfnt.tables.set("name", {
        offset: 0,
        length: newNameTable.length,
        checksum: 0,
        data: newNameTable,
      });
      finalBytes = assembleSfnt(sfnt.sfntVersion, sfnt.tables);
      renamed = true;
    }

    // Extract metrics from the final font
    const finalSfnt = renamed ? parseSfnt(finalBytes) : sfnt;
    const { metrics, axes } = extractFontMetrics(finalBytes, finalSfnt.tables);

    return {
      upem: metrics.upem,
      ascent: metrics.ascent,
      descent: metrics.descent,
      lineGap: metrics.lineGap,
      useTypoMetrics: metrics.useTypoMetrics,
      axes,
      converted,
      renamed,
      ...(renamed || converted ? { bytes: finalBytes } : {}),
    };
  } catch (err) {
    return (err as Error).message.slice(0, 200);
  }
};

/** Alias for backwards compatibility. */
export const pythonFontConverter = nativeFontConverter;
