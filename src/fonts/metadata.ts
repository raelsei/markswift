import type { FontFace } from "../model/layout.ts";
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
      ...(f.axes["opsz"] ? { opsz: f.axes["opsz"] } : prev?.opsz ? { opsz: prev.opsz } : {}),
    };
  }
  // Keep every face for axis/ambiguity checks, while preserving normal-only legacy resolution.
  for (const [family, metadata] of Object.entries(out)) {
    metadata.faces = pkg.faces.filter(face => face.family === family).map(face => ({
      style: face.style, weight: face.weight, axes: face.axes,
      ...(face.axisDefaults ? { axisDefaults: face.axisDefaults } : {}),
      ...(face.sourceVariations ? { sourceVariations: face.sourceVariations } : {}),
      ...(face.postScriptName ? { postScriptName: face.postScriptName } : {}),
      ...(face.assetHash ? { assetHash: face.assetHash } : {}),
    }));
  }
  return out;
}


/** Faces of every capture in an out dir, deduplicated — one bundle serves all of its screens. */
export function unionFaces(docs: Array<{ fonts?: FontFace[] }>): FontFace[] {
  const byKey: Record<string, FontFace> = {};
  for (const doc of docs) {
    for (const f of doc.fonts ?? []) {
      const key = `${f.family}|${f.style}|${f.weight.join("-")}|${f.unicodeRange ?? ""}|${f.src.map((s) => s.file ?? s.url).join(",")}|${JSON.stringify(f.variationSettings ?? null)}`;
      // A face that loaded somewhere loaded: the same family is a fallback on a screen that
      // happens not to use it.
      const prev = byKey[key];
      if (!prev) byKey[key] = f;
      else if (f.loaded && !prev.loaded) byKey[key] = f;
    }
  }
  return Object.keys(byKey)
    .sort()
    .map((k) => byKey[k]!);
}
