/** Local visual-pilot measurements. Pixel bands are an ink proxy, not OCR. */
import sharp from "sharp";
import type { LayoutNode, Rect } from "../../src/model/layout.ts";

function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

export function browserTextMetrics(root: LayoutNode, expected: string) {
  const fragments: Rect[] = [];
  const texts: string[] = [];
  function walk(node: LayoutNode) {
    if (node.tag === "#text" && node.text) {
      texts.push(node.text);
      fragments.push(...(node.lines?.map((line) => line.bounds) ?? [node.bounds]));
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  const content = texts.join("").trim();
  const bands: Rect[][] = [];
  for (const rect of fragments.filter((r) => r.w > 0 && r.h > 0).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const band = bands.find((items) =>
      items.some((item) => rect.y < item.y + item.h - 2 && item.y < rect.y + rect.h - 2),
    );
    if (band) band.push(rect);
    else bands.push([rect]);
  }
  const lineBounds = bands.map((items) => union(items)!);
  return {
    content,
    contentMatches: content === expected,
    lineCount: lineBounds.length,
    lineBounds,
    bounds: union(lineBounds),
    first: lineBounds[0] ?? null,
    last: lineBounds.at(-1) ?? null,
    browserInk: null as Awaited<ReturnType<typeof imageInkMetrics>> | null,
    nativeInk: null as Awaited<ReturnType<typeof imageInkMetrics>> | null,
    expectedLines: null as number | null,
    fonts: null as unknown,
  };
}

export async function imageInkMetrics(path: string, dpr: number) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const bg = [data[0]!, data[1]!, data[2]!];
  const rows: Array<{ y: number; minX: number; maxX: number }> = [];
  for (let y = 0; y < height; y++) {
    let minX = width,
      maxX = -1;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const delta = Math.max(...bg.map((c, channel) => Math.abs(data[offset + channel]! - c)));
      if (delta > 35) {
        minX = Math.min(minX, x);
        maxX = x;
      }
    }
    if (maxX >= 0) rows.push({ y, minX, maxX });
  }
  const lines: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const row of rows) {
    const last = lines.at(-1);
    if (last && row.y <= (last.y + last.h) * dpr + 3) {
      const right = last.x + last.w;
      last.x = Math.min(last.x, row.minX / dpr);
      last.w = Math.max(right, (row.maxX + 1) / dpr) - last.x;
      last.h = (row.y + 1) / dpr - last.y;
    } else lines.push({ x: row.minX / dpr, y: row.y / dpr, w: (row.maxX - row.minX + 1) / dpr, h: 1 / dpr });
  }
  return {
    lineCount: lines.length,
    lineBounds: lines,
    bounds: union(lines),
    first: lines[0] ?? null,
    last: lines.at(-1) ?? null,
    background: bg,
  };
}
