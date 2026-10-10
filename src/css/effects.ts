/** Pure effects interpretation of browser-resolved CSS values. */
import type { ClipShape, Filter } from "../model/semantic.ts";
import { px, splitTop, resolveLength, round2 } from "./syntax.ts";
import { hue } from "./color.ts";
import { parseShadows } from "./shadows.ts";
import { fraction } from "./paint.ts";

/**
 * Computed `filter` list → ordered entries. Chrome serialises amounts as bare numbers
 * (`grayscale(1)`), lengths in px and angles in deg. `url()` and unknown functions land
 * in `unsupported` (raw text) so the caller can note them.
 */
export function parseFilters(s: string | undefined): { filters: Filter[]; unsupported: string[] } {
  const filters: Filter[] = [];
  const unsupported: string[] = [];
  if (!s || s === "none") return { filters, unsupported };
  for (const fn of s.match(/[a-z-]+\((?:[^()]|\([^()]*\))*\)/gi) ?? []) {
    const m = /^([a-z-]+)\((.*)\)$/is.exec(fn)!;
    const name = m[1]!.toLowerCase(),
      arg = m[2]!.trim();
    switch (name) {
      case "blur":
        filters.push({ kind: "blur", radius: px(arg) });
        break;
      case "hue-rotate":
        filters.push({ kind: "hue-rotate", degrees: hue(arg) ?? 0 });
        break;
      case "drop-shadow": {
        const shadow = parseShadows(arg)[0];
        if (shadow) filters.push({ kind: "drop-shadow", shadow });
        else unsupported.push(fn);
        break;
      }
      case "grayscale":
      case "brightness":
      case "contrast":
      case "saturate":
      case "invert":
      case "sepia":
      case "opacity":
        filters.push({ kind: name, amount: arg.endsWith("%") ? parseFloat(arg) / 100 : parseFloat(arg) });
        break;
      default:
        unsupported.push(fn);
    }
  }
  return { filters, unsupported };
}

/**
 * Computed `clip-path` basic shape → px geometry inside a `w`×`h` box. Handles
 * `circle(r at x y)`, `ellipse(rx ry at x y)`, `inset(t r b l round …)`, `polygon(…)`
 * with px/%/`closest-side`/`farthest-side` and `at` keywords. `none`, `path()`, `url()`
 * and reference boxes → undefined.
 */
export function parseClipPath(s: string | undefined, w: number, h: number): ClipShape | undefined {
  if (!s || s === "none") return undefined;
  const m = /^(circle|ellipse|inset|polygon)\((.*)\)\s*$/s.exec(s.trim());
  if (!m) return undefined;
  const body = m[2]!.trim();
  if (m[1] === "polygon") {
    const points: Array<[number, number]> = [];
    for (const pair of splitTop(body, ",")) {
      const [x, y] = splitTop(pair, " ");
      if (x === "nonzero" || x === "evenodd") continue;
      const px_ = resolveLength(x ?? "", w),
        py_ = resolveLength(y ?? "", h);
      if (px_ === undefined || py_ === undefined) return undefined;
      points.push([round2(px_), round2(py_)]);
    }
    return points.length >= 3 ? { kind: "polygon", points } : undefined;
  }
  if (m[1] === "inset") {
    const [insets, round] = body.split(/\s+round\s+/);
    const t = splitTop(insets ?? "", " ");
    const v = [t[0] ?? "0", t[1] ?? t[0] ?? "0", t[2] ?? t[0] ?? "0", t[3] ?? t[1] ?? t[0] ?? "0"];
    const top = resolveLength(v[0]!, h),
      right = resolveLength(v[1]!, w),
      bottom = resolveLength(v[2]!, h),
      left = resolveLength(v[3]!, w);
    if (top === undefined || right === undefined || bottom === undefined || left === undefined) return undefined;
    const shape: ClipShape = {
      kind: "inset",
      top: round2(top),
      right: round2(right),
      bottom: round2(bottom),
      left: round2(left),
    };
    const radius = round ? resolveLength(splitTop(round, " ")[0] ?? "", Math.min(w, h)) : undefined;
    if (radius) shape.radius = round2(radius);
    return shape;
  }
  const [radii = "", at] = body.split(/\s+at\s+/);
  const pos = at ? splitTop(at, " ") : ["center", "center"];
  const keyword = (t: string) => (/^(left|top|center|right|bottom)$/.test(t) ? fraction(t) : undefined);
  const kx = keyword(pos[0]!),
    ky = keyword(pos[1] ?? "center");
  const cx = kx !== undefined ? kx * w : resolveLength(pos[0]!, w);
  const cy = ky !== undefined ? ky * h : resolveLength(pos[1] ?? "", h);
  if (cx === undefined || cy === undefined) return undefined;
  const [rxT = "closest-side", ryT = rxT] = splitTop(radii, " ");
  if (m[1] === "circle") {
    // Percent radius resolves against sqrt(w² + h²)/√2; side keywords against the nearest/farthest edge.
    const sides = [cx, w - cx, cy, h - cy];
    const r =
      rxT === "closest-side"
        ? Math.min(...sides)
        : rxT === "farthest-side"
          ? Math.max(...sides)
          : resolveLength(rxT, Math.hypot(w, h) / Math.SQRT2);
    return r === undefined ? undefined : { kind: "circle", cx: round2(cx), cy: round2(cy), r: round2(r) };
  }
  const radius = (t: string, ref: number, side: number) =>
    t === "closest-side" ? side : t === "farthest-side" ? ref - side : resolveLength(t, ref);
  const rx = radius(rxT, w, Math.min(cx, w - cx)),
    ry = radius(ryT, h, Math.min(cy, h - cy));
  if (rx === undefined || ry === undefined) return undefined;
  return { kind: "ellipse", cx: round2(cx), cy: round2(cy), rx: round2(rx), ry: round2(ry) };
}
