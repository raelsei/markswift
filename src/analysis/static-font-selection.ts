import type { BundledFontFace } from "../model/fonts.ts";

export type StaticFontSelection =
  | { kind: "static"; face: BundledFontFace & { postScriptName: string; assetHash: string }; matchedWeight: number }
  | { kind: "variable" }
  | { kind: "unavailable"; reason: string };

/** CSS Fonts §5.2 weight matching, restricted to independently identified static sources. */
export function selectStaticFontFace(weight: number, faces: readonly BundledFontFace[] | undefined, style: Record<string, string>): StaticFontSelection {
  const unavailable = (reason: string): StaticFontSelection => ({ kind: "unavailable", reason });
  if (!Array.isArray(faces) || !faces.length) return unavailable("packaged face catalog/public source names absent; CSS face identity unavailable");
  if (faces.some(face => !face || typeof face !== "object" || !face.axes || typeof face.axes !== "object" || Array.isArray(face.axes)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(face.axes))
    || Object.values(face.axes).some(bounds => !Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(Number.isFinite) || bounds[0] > bounds[1]))) {
    return unavailable("packaged source axis state is unknown");
  }
  // Do not replace ANY variable branch (including optical-only and non-normal faces).
  if (faces.some(face => Object.keys(face.axes).length > 0)) return { kind: "variable" };
  if (style["font-style"] !== "normal" || style["font-stretch"] !== "100%") return unavailable("normal style and unmodified font-stretch are not proved");
  if (style["font-synthesis"] !== "none") return unavailable("font-synthesis:none is not captured; synthetic face behavior is unproved");
  if (!Number.isFinite(weight) || weight < 1 || weight > 1000) return unavailable("requested CSS weight is unavailable");
  const byPublicName = new Map<string, string>();
  for (const face of faces) {
    if (typeof face.postScriptName !== "string" || !face.postScriptName.trim() || typeof face.assetHash !== "string" || !/^[a-f\d]{64}$/i.test(face.assetHash)) return unavailable("public source names/packaged asset bindings incomplete");
    const previous = byPublicName.get(face.postScriptName);
    if (previous && previous !== face.assetHash) return unavailable("public source name has ambiguous packaged assets");
    byPublicName.set(face.postScriptName, face.assetHash!);
  }
  const normal = faces.filter(face => face.style === "normal");
  if (!normal.length) return unavailable("normal source face absent");
  const byWeight = new Map<number, BundledFontFace & { postScriptName: string; assetHash: string }>();
  for (const face of normal) {
    if (!Array.isArray(face.weight) || face.weight.length !== 2
      || face.weight[0] !== face.weight[1] || !Number.isFinite(face.weight[0]) || face.weight[0] < 1 || face.weight[0] > 1000) {
      return unavailable("static CSS point weights/public source names/packaged asset bindings incomplete");
    }
    const previous = byWeight.get(face.weight[0]);
    if (previous && (previous.postScriptName !== face.postScriptName || previous.assetHash !== face.assetHash)) return unavailable("same CSS weight has ambiguous packaged source faces");
    byWeight.set(face.weight[0], face as BundledFontFace & { postScriptName: string; assetHash: string });
  }
  const ascending = [...byWeight.keys()].sort((a, b) => a - b);
  const descending = [...ascending].reverse();
  const search = weight >= 400 && weight <= 500
    ? [...ascending.filter(w => w >= weight && w <= 500), ...descending.filter(w => w < weight), ...ascending.filter(w => w > 500)]
    : weight < 400 ? [...descending.filter(w => w <= weight), ...ascending.filter(w => w > weight)]
      : [...ascending.filter(w => w >= weight), ...descending.filter(w => w < weight)];
  const matchedWeight = search[0];
  if (matchedWeight === undefined) return unavailable("no static source face remains");
  return { kind: "static", face: byWeight.get(matchedWeight)!, matchedWeight };
}
