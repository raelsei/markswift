import type { BundledFamily, BundledFamilies, FontMetrics } from "../model/fonts.ts";
import type { FontPackage } from "./types.ts";

/** Metrics captured by this package, isolated from all other conversions. */
export function metricsForFonts(pkg: FontPackage): FontMetrics {
  return Object.fromEntries(pkg.faces.map((face) => [face.family.toLowerCase(), { ...face.metrics }]));
}

/** Families of a package, in the shape the inference pass resolves `font-family` against. */
export function bundledFamilies(pkg: FontPackage): BundledFamilies {
  const out: Record<string, BundledFamily> = {};
  for (const f of pkg.faces) {
    if (f.style !== "normal") continue; // `fontOf` resolves a family, not a face; italic is a run flag.
    // A family shipped as several static weights is one family covering their union.
    const prev = out[f.family];
    out[f.family] = {
      weight: prev ? [Math.min(prev.weight[0], f.weight[0]), Math.max(prev.weight[1], f.weight[1])] : f.weight,
      ...(f.axes["wght"] ? { wght: f.axes["wght"] } : prev?.wght ? { wght: prev.wght } : {}),
      ...(f.axes["opsz"] ? { opsz: f.axes["opsz"] } : prev?.opsz ? { opsz: prev.opsz } : {}),
    };
  }
  return out;
}
