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
    const { wght: _w, opsz: _o, ...axes } = f.axes;
    out[f.family] = {
      weight: prev ? [Math.min(prev.weight[0], f.weight[0]), Math.max(prev.weight[1], f.weight[1])] : f.weight,
      ...(f.axes["wght"] ? { wght: f.axes["wght"] } : prev?.wght ? { wght: prev.wght } : {}),
      ...(f.axes["opsz"] ? { opsz: f.axes["opsz"] } : prev?.opsz ? { opsz: prev.opsz } : {}),
      ...(Object.keys(axes).length ? { axes } : prev?.axes ? { axes: prev.axes } : {}),
    };
  }
  for (const f of pkg.faces) {
    if (f.style !== "normal") continue;
    const name = f.sourceFamily ?? f.family;
    if (!pkg.faces.some((face) => face.sourceFamily === name && face.family !== name)) continue;
    const family = (out[name] ??= { ...out[f.family]! });
    const widths = (family.widths ??= []);
    if (!widths.some((w) => w.name === f.family)) widths.push({ name: f.family, stretch: f.stretch ?? [100, 100] });
  }
  return out;
}
