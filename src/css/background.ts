/** Pure background interpretation of browser-resolved CSS values. */
import { splitTop, resolveLength } from "./syntax.ts";


/** `background-repeat` per layer; `space`/`round` collapse to `repeat`. */
export type BackgroundRepeat = "no-repeat" | "repeat" | "repeat-x" | "repeat-y";


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
 * Intrinsic size of a `data:image/svg+xml` URL from its `width`/`height` (or `viewBox`)
 * attributes; undefined for raster or external images (the browser knows, we do not).
 */
export function imageSize(url: string): { w: number; h: number } | undefined {
  if (!/^data:image\/svg\+xml/i.test(url)) return undefined;
  const comma = url.indexOf(",");
  let svg = url.slice(comma + 1);
  if (/;base64/i.test(url.slice(0, comma))) svg = Buffer.from(svg, "base64").toString("utf8");
  else svg = decodeURIComponent(svg);
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const attr = (n: string) => {
    const m = new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(open);
    return m ? (m[1] ?? m[2] ?? m[3])!.trim() : undefined;
  };
  const w = attr("width"), h = attr("height");
  if (w && h && /^[\d.]+(px)?$/.test(w) && /^[\d.]+(px)?$/.test(h)) return { w: parseFloat(w), h: parseFloat(h) };
  const vb = attr("viewBox")?.split(/[\s,]+/).map(Number);
  return vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0 ? { w: vb[2]!, h: vb[3]! } : undefined;
}


/** Resolved `background-size` layer: explicit px box or the `cover`/`contain` keywords. */
export type BackgroundSize = { w: number; h: number } | "cover" | "contain";


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
