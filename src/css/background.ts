/** Pure background interpretation of browser-resolved CSS values. */
import { splitTop, resolveLength } from "./syntax.ts";
import type { BackgroundRepeat, BackgroundSize } from "../model/values.ts";


/** Computed `background-repeat` (first layer) → one of the four tile modes; `space`/`round` → `repeat`. */
export function parseBackgroundRepeat(s: string | undefined): BackgroundRepeat | undefined {
  const layer = splitTop(s ?? "", ",")[0];
  if (!layer) return undefined;
  const [x, y = x] = layer.split(/\s+/).map((t) => (t === "space" || t === "round" ? "repeat" : t));
  if (x === "repeat-x" || x === "repeat-y" || x === "no-repeat" || x === "repeat") {
    if (x !== "repeat" && x !== "no-repeat") return x;
    if (x === y) return x;
    return x === "repeat" ? "repeat-x" : "repeat-y";
  }
  return undefined;
}


/**
 * One `background-size` layer (first layer of a comma list) → px box, `cover`/`contain`,
 * or undefined when it depends on the image's intrinsic size (`auto`) and `imgW`/`imgH`
 * are not given. `auto` on one axis keeps the image aspect ratio.
 */
export function parseBackgroundSize(
  s: string | undefined,
  boxW: number,
  boxH: number,
  imgW?: number,
  imgH?: number,
): BackgroundSize | undefined {
  if (!s) return undefined;
  const layer = splitTop(s, ",")[0];
  if (!layer) return undefined;
  if (layer === "cover" || layer === "contain") return layer;
  const parts = splitTop(layer, " ");
  const tw = parts[0]!, th = parts[1] ?? "auto";
  const w = tw === "auto" ? undefined : resolveLength(tw, boxW);
  const h = th === "auto" ? undefined : resolveLength(th, boxH);
  if ((tw !== "auto" && w === undefined) || (th !== "auto" && h === undefined)) return undefined;
  if (w !== undefined && h !== undefined) return { w, h };
  if (imgW === undefined || imgH === undefined) return undefined;
  if (w === undefined && h === undefined) return { w: imgW, h: imgH };
  const ratio = imgH === 0 ? 0 : imgW / imgH;
  return w !== undefined ? { w, h: ratio === 0 ? 0 : w / ratio } : { w: h! * ratio, h: h! };
}


/**
 * One `background-position` layer → `[x, y]` px offset of the image's top-left corner.
 * Handles px, `%`, `calc()`, side keywords (`left center right top bottom`) and the
 * 3/4-value `right 10px bottom 20px` form. Percentages and far-side offsets resolve
 * against `box − image` when `imgW`/`imgH` are given, else against the box.
 */
export function parseBackgroundPosition(s: string | undefined, boxW: number, boxH: number, imgW = 0, imgH = 0): [number, number] {
  const tokens = splitTop(splitTop(s ?? "", ",")[0] ?? "", " ");
  if (!tokens.length) return [0, 0];
  const spanX = boxW - imgW, spanY = boxH - imgH;
  const isY = (t: string) => t === "top" || t === "bottom";
  const isX = (t: string) => t === "left" || t === "right";
  const edge = (t: string, span: number) => (t === "left" || t === "top" ? 0 : t === "center" ? span / 2 : span);
  if (tokens.length <= 2) {
    let [tx = "center", ty = "center"] = tokens;
    if (isY(tx) || isX(ty)) [tx, ty] = [ty, tx];
    const x = isX(tx) || tx === "center" ? edge(tx, spanX) : resolveLength(tx, spanX);
    const y = isY(ty) || ty === "center" ? edge(ty, spanY) : resolveLength(ty, spanY);
    return [x ?? 0, y ?? 0];
  }
  // 3/4-value form: `<side> [<offset>]` pairs, offsets measured from the named side.
  let x = 0, y = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!isX(t) && !isY(t) && t !== "center") return [0, 0];
    const span = isY(t) ? spanY : spanX;
    const next = tokens[i + 1];
    const off = next !== undefined && !isX(next) && !isY(next) && next !== "center" ? resolveLength(next, span) : undefined;
    if (off !== undefined) i++;
    const v = edge(t, span) + (t === "right" || t === "bottom" ? -(off ?? 0) : (off ?? 0));
    if (isY(t)) y = v;
    else x = v;
  }
  return [x, y];
}
