import type { Paint } from "../css/index.ts";
import type { SemNode, ImageNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { colorExpr, fontExpr, indent, num, str } from "./format.ts";
import { svgFromMarkup } from "../analysis/svg.ts";
import { svgExpr } from "./svg.ts";
import { note } from "./diagnostics.ts";
type ImagePaint = Extract<Paint, { kind: "image" }>;

/**
 * An image sized and placed like a CSS background layer: a box-filling `Color.clear` carries
 * the image as an overlay so cover/contain overflow is aligned to the box and clipped by the
 * caller. Vector sources are scaled here (cover/contain/explicit size against the intrinsic SVG viewport);
 * raster ones let SwiftUI scale. Repeats tile through `MarkswiftTile` whenever the tile size is
 * known (vector viewport, decoded raster header or explicit size). Unresolved raster sizes use `.tile`.
 * `undefined` when the source cannot be shown (noted on the node).
 */
export function imageLayer(p: ImagePaint, n: SemNode, prop: string, ctx: EmitContext): string[] | undefined {
  const src = imageSource(p.url, n, prop, ctx, p.size !== undefined);
  if (!src) return undefined;
  const box = n.frame;
  const repeat = p.repeat !== undefined && p.repeat !== "no-repeat";
  // Tile size: explicit, captured raster intrinsic dimensions, or the vector's intrinsic viewport.
  const tile: [number, number] | undefined = repeat ? (typeof p.size === "object" ? [p.size.w, p.size.h] : src.kind === "vector" ? src.size : undefined) : undefined;
  let view: string[];
  if (src.kind === "vector") {
    const [vw, vh] = src.size;
    const s = p.size === "cover" ? Math.max(box.w / vw, box.h / vh) : p.size === "contain" ? Math.min(box.w / vw, box.h / vh) : 1;
    view = src.view(typeof p.size === "object" ? p.size.w : vw * s, typeof p.size === "object" ? p.size.h : vh * s);
  } else if (tile) view = [src.expr(".resizable()")];
  else if (repeat) {
    // `.tile` repeats at the intrinsic size from the top-left corner; axis and phase are lost.
    view = [src.expr(".resizable(resizingMode: .tile)")];
    if (p.repeat !== "repeat") note(n, `approximated: background-repeat ${p.repeat} tiles both axes`);
    if (p.position && (p.position[0] !== 0 || p.position[1] !== 0)) note(n, `approximated: background-position ignored on a repeating ${prop}`);
  } else {
    const sizing = p.size === "cover" ? ".resizable().scaledToFill()" : p.size === "contain" ? ".resizable().scaledToFit()" : p.size ? `.resizable().frame(width: ${num(p.size.w)}, height: ${num(p.size.h)})` : "";
    view = [src.expr(sizing)];
  }
  if (tile) {
    const [x, y] = p.position ?? [0, 0];
    const args = [`tile: CGSize(width: ${num(tile[0])}, height: ${num(tile[1])})`, x || y ? `origin: CGPoint(x: ${num(x)}, y: ${num(y)})` : "", p.repeat === "repeat-x" ? "axes: .horizontal" : p.repeat === "repeat-y" ? "axes: .vertical" : ""];
    return ["Color.clear", `.overlay { MarkswiftTile(${args.filter(Boolean).join(", ")}) {`, ...indent(view, 1), "} }"];
  }
  if (repeat || !p.position) return ["Color.clear", ".overlay {", ...indent(view, 1), "}"];
  const [x, y] = p.position;
  return ["Color.clear", ".overlay(alignment: .topLeading) {", ...indent(x || y ? [...view, `.offset(x: ${num(x)}, y: ${num(y)})`] : view, 1), "}"];
}

type ImageSource =
  /** A raster view; `sizing` is spliced where the resizable modifiers belong. */
  | { kind: "raster"; expr: (sizing: string) => string }
  /** Standalone SVG drawn as Shapes; `size` is its natural viewport, distinct from its viewBox. */
  | { kind: "vector"; size: [number, number]; view: (w: number, h: number) => string[] };

/**
 * Image source for a URL. Inline `data:` payloads: SVG markup becomes vector Shapes (UIImage
 * cannot decode SVG), anything else decodes at runtime through `Image.markswiftData` (never
 * force-unwrapped). `http(s)` loads asynchronously; anything else is an asset-catalog name.
 * `undefined` (with a note) when the payload is unusable.
 */
function imageSource(url: string, n: SemNode, prop: string, ctx: EmitContext, sizedBackground = false): ImageSource | undefined {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data) {
    if (/^https?:/i.test(url)) return { kind: "raster", expr: (sizing) => `AsyncImage(url: URL(string: ${str(url)})) { $0${sizing} } placeholder: { Color.clear }` };
    const name = url.replace(/[?#].*$/, "").replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "");
    return { kind: "raster", expr: (sizing) => `Image(${str(name)})${sizing}` };
  }
  const [, mime = "", params = "", payload = ""] = data;
  const base64 = params.split(";").includes("base64");
  if (mime !== "image/svg+xml") {
    const b64 = base64 ? payload : Buffer.from(payload.replace(/%([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("base64");
    return { kind: "raster", expr: (sizing) => `Image.markswiftData(${str(b64)})${sizing}` };
  }
  const markup = base64 ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
  const svg = svgFromMarkup(markup, { x: 0, y: 0, w: 0, h: 0 });
  if (!svg) {
    note(n, `unmapped: ${prop} svg data: URL has no usable viewBox or intrinsic size; layer dropped`);
    return undefined;
  }
  for (const t of svg.notes) note(n, t);
  if (svg.invalidIntrinsic) {
    if (prop !== "img" && !sizedBackground) {
      note(n, `unmapped: ${prop} ${svg.invalidIntrinsic}; automatic-size layer dropped`);
      return undefined;
    }
    note(n, `approximated: ${prop} ${svg.invalidIntrinsic}; sizing uses viewBox ratio`);
  }
  return {
    kind: "vector",
    size: svg.intrinsicSize ?? [svg.viewBox[2], svg.viewBox[3]],
    view: (w, h) => {
      svg.frame = { x: 0, y: 0, w, h };
      // No node id: the extractor does not enumerate the colours of an SVG inlined through a
      // `data:` URL, so they stay literals.
      return [...svgExpr(svg, ctx.shapes, ctx), `.frame(width: ${num(w)}, height: ${num(h)})`];
    },
  };
}

/**
 * Payload prefixes of the raster formats UIImage decodes. A `data:` URL matching none of them is
 * a broken image: the browser paints the `alt` text in the box instead of the picture, and so do we.
 */
const RASTER_MAGIC: number[][] = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0x42, 0x4d], // BMP
  [0x52, 0x49, 0x46, 0x46], // RIFF (WebP)
  [0x49, 0x49, 0x2a, 0x00], // TIFF little-endian
  [0x4d, 0x4d, 0x00, 0x2a], // TIFF big-endian
];

/** Can this source produce pixels? Only an inline payload can be judged here; anything else resolves at runtime. */
function decodable(url: string): boolean {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data) return url.length > 0;
  const [, mime = "", params = "", payload = ""] = data;
  if (mime === "image/svg+xml") return true;
  const bytes = params.split(";").includes("base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "latin1");
  return RASTER_MAGIC.some((magic) => magic.every((b, i) => bytes[i] === b));
}

/**
 * `<img>`: the source at the IR's content mode. A source that cannot produce pixels falls back to
 * the alt text in the measured box, where the browser draws it too; `alt` is also the
 * accessibility label, and `alt=""` marks the image decorative.
 */
export function imageNodeExpr(n: ImageNode, ctx: EmitContext): string[] {
  const a11y = n.alt === undefined ? [] : n.alt === "" ? [".accessibilityHidden(true)"] : [`.accessibilityLabel(${str(n.alt)})`];
  const src = decodable(n.src) ? imageSource(n.src, n, "img", ctx) : undefined;
  if (!src) {
    if (!n.alt) return ["Color.clear", ...a11y];
    // The browser paints the alt text at the top-left of the box in the element's own font.
    note(n, "approximated: broken image source → alt text in the measured box");
    return [
      `Text(verbatim: ${str(n.alt)})`,
      ...(n.font ? [`.font(${fontExpr(n.font, ctx)})`] : []),
      ...(n.color ? [`.foregroundStyle(${colorExpr(n.color, ctx, n.id)})`] : []),
      ".frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)",
      ...a11y,
    ];
  }
  if (src.kind === "raster") {
    const sizing = n.contentMode === "stretch" ? ".resizable()" : n.contentMode === "none" ? "" : `.resizable().aspectRatio(contentMode: .${n.contentMode})`;
    return [src.expr(sizing), ...a11y];
  }
  // Vector: `fit` draws inside the box; `fill` covers it; `stretch` scales both axes
  // independently, and `none` leaves the natural viewport at intrinsic size. The overlay's
  // primary view owns the measured <img> box. An oversized vector must not set the
  // box's ideal size, otherwise SwiftUI's later fill frame can crop from the wrong
  // edge; a narrower vector must likewise remain centred in that box.
  const [vw, vh] = src.size;
  if (n.contentMode === "stretch") {
    // SVG is rerendered at the CSS image viewport. Its own preserveAspectRatio
    // still governs how the viewBox fits that new viewport.
    return [...src.view(n.frame.w, n.frame.h), ...a11y];
  }
  const s = n.contentMode === "none" ? 1 : n.contentMode === "fill" ? Math.max(n.frame.w / vw, n.frame.h / vh) : Math.min(n.frame.w / vw, n.frame.h / vh);
  return ["Color.clear", ".overlay(alignment: .center) {", ...indent(src.view(vw * s, vh * s), 1), "}", ...a11y];
}
