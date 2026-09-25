import type { FontFace } from "../model/layout.ts";
import type { FontPackage } from "./types.ts";
/**
 * Packages every bundleable face into `<swiftDir>/Fonts/` and returns what was written.
 *
 * `outDir` resolves `src[].file` (the capture's `_fonts/`). Faces are grouped by (family,
 * style): within a group the Basic-Latin subset wins, the rest are reported. A face whose bytes
 * cannot be read, or whose format iOS cannot load and `fontTools` cannot convert, is noted and
 * skipped — except that a failed *conversion* still writes the original bytes, so the
 * missing-converter case is visible in the bundle instead of looking like a design with no font.
 */
export declare function packageFonts(faces: FontFace[], swiftDir: string, outDir: string): Promise<FontPackage>;
