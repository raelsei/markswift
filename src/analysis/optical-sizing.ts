import type { BundledFamily } from "../model/fonts.ts";

export type OpticalSizeSelection =
  | { kind: "absent" }
  | { kind: "auto" }
  | { kind: "none"; value: number }
  | { kind: "unavailable"; reason: string };

/** Qualifies a source default separately from the existing automatic font-size route. */
export function selectOpticalSize(style: Record<string, string>, family: BundledFamily): OpticalSizeSelection {
  const unavailable = (reason: string): OpticalSizeSelection => ({ kind: "unavailable", reason });
  if (!family.opsz) return { kind: "absent" };
  const mode = style["font-optical-sizing"];
  if (mode !== "auto" && mode !== "none") return unavailable("captured font-optical-sizing is unavailable");
  if (style["font-variation-settings"] !== "normal") return unavailable("element font-variation-settings:normal is not proved");
  if (!Array.isArray(family.faces) || !family.faces.length) return unavailable("packaged optical source catalog is unavailable");
  for (const face of family.faces) {
    if (!record(face.axes) || !range(face.axes.opsz)
      || typeof face.postScriptName !== "string" || !face.postScriptName.trim()
      || typeof face.assetHash !== "string" || !/^[a-f\d]{64}$/i.test(face.assetHash)) {
      return unavailable("packaged optical source identity/axis is unavailable or ambiguous");
    }
    if (!Array.isArray(face.sourceVariations) || !face.sourceVariations.length
      || face.sourceVariations.some(value => typeof value !== "string" || value.trim().toLowerCase() !== "normal")) {
      return unavailable("source variation descriptors are unknown, conflicting or non-normal");
    }
  }
  // Keep automatic coordinates unchanged. The none route additionally requires real defaults.
  if (mode === "auto") return { kind: "auto" };
  const defaults: number[] = [];
  for (const face of family.faces) {
    if (!record(face.axisDefaults) || Object.entries(face.axes).some(([tag, bounds]) => !range(bounds)
      || !Number.isFinite(face.axisDefaults![tag]) || face.axisDefaults![tag]! < bounds[0] || face.axisDefaults![tag]! > bounds[1])) {
      return unavailable("actual fvar defaults are missing, invalid or outside source ranges");
    }
    defaults.push(face.axisDefaults.opsz!);
  }
  if (new Set(defaults).size !== 1) return unavailable("packaged optical source defaults disagree");
  return { kind: "none", value: defaults[0]! };
}

function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function range(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[0] <= value[1];
}
