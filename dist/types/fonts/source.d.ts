import type { FontFace } from "../model/layout.ts";
/** Codepoints a face must cover to be the one worth bundling: Basic Latin. */
export declare function coversLatin(range: string | undefined): boolean;
/** Bytes behind one `src` entry: the `data:` URL itself, or the file the capture saved. */
export declare function srcBytes(src: FontFace["src"][number], outDir: string): Promise<Uint8Array | undefined>;
/** OpenType weight class → the subfamily name a font file conventionally carries for it. */
export declare const WEIGHT_SUBFAMILY: Record<number, string>;
/** `Geist Variable` → `GeistVariable`; a file name and a PostScript name stem. */
export declare function sanitize(family: string): string;
/** Font files of a generated Swift dir, for the harness to bundle. */
export declare function packagedFontFiles(swiftDir: string): Promise<string[]>;
