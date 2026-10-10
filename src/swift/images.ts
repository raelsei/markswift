import { createHash } from "node:crypto";
import type { Paint } from "../css/index.ts";
import type { SemNode, ImageNode } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { colorExpr, fontExpr, indent, num, str } from "./format.ts";
import { svgFromMarkup } from "../analysis/svg/markup.ts";
import { svgExpr } from "./svg.ts";
import { note } from "./diagnostics.ts";
type ImagePaint = Extract<Paint, { kind: "image" }>;
/** The capture's temporary static server (or any local dev server): dead once the conversion returns. */
const LOOPBACK = /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost|\[::1\])(:\d+)?(\/|$)/i;

/**
 * An image sized and placed like a CSS background layer: a box-filling `Color.clear` carries
 * the image as an overlay so cover/contain overflow is aligned to the box and clipped by the
 * caller. Vector sources are scaled here (cover/contain/explicit size against the viewBox);
 * raster ones let SwiftUI scale. Repeats tile through `MarkswiftTile` whenever the tile size is
 * known (vector viewBox or explicit size); a raster at its intrinsic size uses `.tile`.
 * `undefined` when the source cannot be shown (noted on the node).
 */
export function imageLayer(p: ImagePaint, n: SemNode, prop: string, ctx: EmitContext): string[] | undefined {
  const src = imageSource(p.url, n, prop, ctx);
  if (!src) return undefined;
  const box = n.frame;
  const repeat = p.repeat !== undefined && p.repeat !== "no-repeat";
  // Tile size: explicit, or the vector's viewBox; a raster's intrinsic size is unknown here.
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
    if (p.repeat !== "repeat") note(n, "approximated", "background-repeat", `background-repeat ${p.repeat} tiles both axes`);
    if (p.position && (p.position[0] !== 0 || p.position[1] !== 0)) note(n, "approximated", "background-position", `background-position ignored on a repeating ${prop}`);
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
  /** Standalone SVG drawn as Shapes; `size` is the viewBox, `view` renders it at a given size. */
  | { kind: "vector"; size: [number, number]; view: (w: number, h: number) => string[] };

/**
 * Image source for a URL. Inline `data:` payloads: SVG markup becomes vector Shapes (UIImage
 * cannot decode SVG), a raster becomes one file `Images/<sha256-12>.<ext>` in `ctx.images` (identical
 * bytes share it) loaded through `Image.markswiftAsset`. `http(s)` loads asynchronously; anything
 * else (a loopback or a non-embedded relative URL) has no bytes to ship.
 * `undefined` (with a note) when the source is unusable.
 */
function imageSource(url: string, n: SemNode, prop: string, ctx: EmitContext): ImageSource | undefined {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data) {
    if (/^https?:/i.test(url) && !LOOPBACK.test(url)) return { kind: "raster", expr: (sizing) => `AsyncImage(url: URL(string: ${str(url)})) { $0${sizing} } placeholder: { Color.clear }` };
    dropNote(url, n, prop);
    return undefined;
  }
  const [, mime = "", params = "", payload = ""] = data;
  const base64 = params.split(";").includes("base64");
  if (mime !== "image/svg+xml") {
    const bytes = dataBytes(payload, base64);
    const ext = rasterExt(bytes);
    if (!ext) {
      note(n, "unmapped", imageFeature(prop), `${prop} data: URL is not a PNG/JPEG/GIF/BMP/WebP/TIFF image; layer dropped`);
      return undefined;
    }
    const file = `${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.${ext}`;
    ctx.images[`Images/${file}`] ??= new Uint8Array(bytes);
    return { kind: "raster", expr: (sizing) => `Image.markswiftAsset(${str(file)})${sizing}` };
  }
  const markup = base64 ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
  const svg = svgFromMarkup(markup, { x: 0, y: 0, w: 0, h: 0 });
  if (!svg) {
    note(n, "unmapped", imageFeature(prop), `${prop} svg data: URL has no viewBox; layer dropped`);
    return undefined;
  }
  for (const d of svg.diagnostics) note(n, d.level, d.feature, d.message);
  return {
    kind: "vector",
    size: [svg.viewBox[2], svg.viewBox[3]],
    view: (w, h) => {
      svg.frame = { x: 0, y: 0, w, h };
      // No node id: the extractor does not enumerate the colours of an SVG inlined through a
      // `data:` URL, so they stay literals.
      return [...svgExpr(svg, ctx.shapes, ctx), `.frame(width: ${num(w)}, height: ${num(h)})`];
    },
  };
}

/** Inventory row of an image source: the `<img>` element, or the `url()` value row of `background-image`/`mask-image`. */
function imageFeature(prop: string): string {
  return prop === "img" ? "img" : `${prop}: url()`;
}

/** Why a non-`data:` source that is not a usable remote URL cannot be shown. */
function dropNote(url: string, n: SemNode, prop: string): void {
  note(n, "unmapped", imageFeature(prop), LOOPBACK.test(url)
    ? `${prop} image ${url} was not captured (temporary local server URL); layer dropped`
    : `${prop} image ${url} is not embedded (no captured bytes); placeholder emitted`);
}

/** Bytes of a `data:` URL payload: base64, or percent-encoded octets. */
function dataBytes(payload: string, base64: boolean): Buffer {
  return base64 ? Buffer.from(payload, "base64") : Buffer.from(payload.replace(/%([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
}

/**
 * Payload prefixes of the raster formats UIImage decodes, with the file extension each ships as.
 * A `data:` URL matching none of them is a broken image: the browser paints the `alt` text in the
 * box instead of the picture, and so do we.
 */
const RASTER_MAGIC: Array<[ext: string, magic: number[]]> = [
  ["png", [0x89, 0x50, 0x4e, 0x47]],
  ["jpg", [0xff, 0xd8, 0xff]],
  ["gif", [0x47, 0x49, 0x46, 0x38]],
  ["bmp", [0x42, 0x4d]],
  ["webp", [0x52, 0x49, 0x46, 0x46]], // RIFF
  ["tiff", [0x49, 0x49, 0x2a, 0x00]], // little-endian
  ["tiff", [0x4d, 0x4d, 0x00, 0x2a]], // big-endian
];

function rasterExt(bytes: Uint8Array): string | undefined {
  return RASTER_MAGIC.find(([, magic]) => magic.every((b, i) => bytes[i] === b))?.[0];
}

/** Can this source produce pixels? An inline payload is judged by its bytes; otherwise only a non-loopback `http(s)` URL can. */
function decodable(url: string): boolean {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data) return /^https?:/i.test(url) && !LOOPBACK.test(url);
  const [, mime = "", params = "", payload = ""] = data;
  return mime === "image/svg+xml" || rasterExt(dataBytes(payload, params.split(";").includes("base64"))) !== undefined;
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
    if (n.src && !n.src.startsWith("data:")) dropNote(n.src, n, "img");
    if (!n.alt) return ["Color.clear", ...a11y];
    // The browser paints the alt text at the top-left of the box in the element's own font.
    note(n, "approximated", "img", "broken image source → alt text in the measured box");
    return [
      `Text(verbatim: ${str(n.alt)})`,
      ...(n.font ? [`.font(${fontExpr(n.font, ctx)})`] : []),
      ...(n.color ? [`.foregroundStyle(${colorExpr(n.color, ctx, n.id)})`] : []),
      ".frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)",
      ...a11y,
    ];
  }
  if (src.kind === "raster") return [src.expr(`.resizable().aspectRatio(contentMode: .${n.contentMode})`), ...a11y];
  // Vector: `fit` draws inside the box (the SVG centres itself); `fill` scales to cover it and
  // relies on the `.clipped()` the modifier chain adds for covering images.
  const [vw, vh] = src.size;
  const s = n.contentMode === "fill" ? Math.max(n.frame.w / vw, n.frame.h / vh) : Math.min(n.frame.w / vw, n.frame.h / vh);
  return [...src.view(vw * s, vh * s), ...a11y];
}
