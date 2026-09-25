import type { FontFace } from "../model/layout.ts";
import type { BundledFamilies, FontMetrics } from "../model/fonts.ts";
import type { FontPackage } from "./types.ts";
/** Metrics captured by this package, isolated from all other conversions. */
export declare function metricsForFonts(pkg: FontPackage): FontMetrics;
/** Families of a package, in the shape the inference pass resolves `font-family` against. */
export declare function bundledFamilies(pkg: FontPackage): BundledFamilies;
/** Faces of every capture in an out dir, deduplicated — one bundle serves all of its screens. */
export declare function unionFaces(docs: Array<{
    fonts?: FontFace[];
}>): FontFace[];
