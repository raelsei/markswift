import type { LayoutNode, Rect } from "../model/layout.ts";
import type { SemBase, StackNode, SvgNode, SvgPath } from "../model/semantic.ts";
import { parseColor } from "../css/index.ts";

/** Blink ListMarker::RelativeSymbolMarkerRect, horizontal LTR, in the measured marker box.
 * Primary sources: chromium core/layout/list/list_marker.cc and paint/text_fragment_painter.cc.
 */
export function markerPaintRect(n: LayoutNode): Rect | undefined {
  const metric = n.markerLayout, text = n.children.find(child => child.tag === "#text");
  if (!metric || !text || n.bounds.w <= 0 || n.bounds.h <= 0
    || Math.abs(text.bounds.h - metric.fontAscent - metric.fontDescent) > 0.2) return undefined;
  const ascent = Math.round(metric.fontAscent);
  if (metric.symbol.startsWith("disclosure-")) {
    // Blink LayoutUnit truncates to 1/64 CSS px; triangles are deliberately not pixel-snapped.
    const size = Math.trunc(metric.fontSize * 0.66 * 64) / 64;
    return { x: text.bounds.x - n.bounds.x, y: text.bounds.y + ascent - size - n.bounds.y, w: size, h: size };
  }
  const twoThirds = Math.trunc(ascent * 2 / 3), size = Math.trunc((twoThirds + 1) / 2);
  const x = text.bounds.x + 1, y = text.bounds.y + Math.trunc(3 * (ascent - twoThirds) / 2);
  const sx = metric.pixelOffset?.x ?? 0, sy = metric.pixelOffset?.y ?? 0;
  return { x: Math.round(x + sx) - sx - n.bounds.x, y: Math.round(y + sy) - sy - n.bounds.y,
    w: Math.round(x + sx + size) - Math.round(x + sx), h: Math.round(y + sy + size) - Math.round(y + sy) };
}

export function buildListSymbol(n: LayoutNode, base: SemBase): SvgNode | undefined {
  const rect = markerPaintRect(n), metric = n.markerLayout;
  if (!rect || !metric) return undefined;
  const color = parseColor(n.styles["-webkit-text-fill-color"] ?? n.styles.color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const { x, y, w, h } = rect;
  let path: SvgPath;
  if (metric.symbol.startsWith("disclosure-")) {
    const points = metric.symbol === "disclosure-open" ? [[0, .07], [.5, .93], [1, .07]] : [[0, 0], [.86, .5], [0, 1]];
    path = { d: points.map(([px, py], i) => `${i ? "L" : "M"}${x + px! * w} ${y + py! * h}`).join(" ") + " Z", fill: color };
  } else if (metric.symbol === "square") path = { d: `M${x} ${y} h${w} v${h} h${-w} Z`, fill: color };
  else {
    const ellipse = `M${x} ${y + h / 2} a${w / 2} ${h / 2} 0 1 0 ${w} 0 a${w / 2} ${h / 2} 0 1 0 ${-w} 0 Z`;
    path = metric.symbol === "circle" ? { d: ellipse, stroke: color, strokeWidth: 1 } : { d: ellipse, fill: color };
  }
  return { ...base, kind: "svg", width: { kind: "fixed", px: n.bounds.w }, height: { kind: "fixed", px: n.bounds.h },
    padding: [0, 0, 0, 0], viewBox: [0, 0, n.bounds.w, n.bounds.h], paths: [path],
    ...(metric.disclosureControl ? { disclosureSymbol: { capturedExpanded: metric.symbol === "disclosure-open", rect } } : {}) };
}

/** An inside shape and text occupy font boxes within the host's CSS line box. */
export function preserveSymbolLineLeading(n: LayoutNode, stack: StackNode): void {
  if (stack.axis !== "h" || /flex|grid/.test(n.styles.display ?? "")
    || !n.children.some(child => child.markerLayout && markerPaintRect(child)) || !stack.children.length) return;
  const top = Math.min(...stack.children.map(child => child.frame.y));
  const bottom = Math.max(...stack.children.map(child => child.frame.y + child.frame.h));
  const contentTop = n.bounds.y + stack.padding[0], contentBottom = n.bounds.y + n.bounds.h - stack.padding[2];
  if (top < contentTop - .2 || bottom > contentBottom + .2) return;
  stack.padding[0] += Math.max(0, top - contentTop);
  stack.padding[2] += Math.max(0, contentBottom - bottom);
}
