/** Natural size of an embedded raster from its header bytes; no image decoder. */

/**
 * A raster `data:` URL → its natural size in CSS px (one pixel each): PNG, GIF, JPEG (EXIF
 * orientations 5–8 swap the axes, as Chrome's `image-orientation: from-image` draws them) and
 * WebP (VP8, VP8L, VP8X). `undefined` for any other URL, format or a truncated header.
 */
export function rasterSize(url: string): { w: number; h: number } | undefined {
  const data = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!data || data[1] === "image/svg+xml") return undefined;
  const [, , params = "", payload = ""] = data;
  const b = params.split(";").includes("base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(
        payload.replace(/%([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))),
        "latin1",
      );
  const size = (w: number, h: number) => (w > 0 && h > 0 ? { w, h } : undefined);
  const ascii = (from: number, to: number) => b.toString("latin1", from, to);
  if (b.length >= 24 && ascii(0, 8) === "\x89PNG\r\n\x1a\n" && ascii(12, 16) === "IHDR")
    return size(b.readUInt32BE(16), b.readUInt32BE(20));
  if (b.length >= 10 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a"))
    return size(b.readUInt16LE(6), b.readUInt16LE(8));
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    const chunk = ascii(12, 16);
    if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
      return size(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
    if (chunk === "VP8L" && b[20] === 0x2f)
      return size(1 + b[21]! + ((b[22]! & 0x3f) << 8), 1 + (b[22]! >> 6) + (b[23]! << 2) + ((b[24]! & 0x0f) << 10));
    if (chunk === "VP8X") return size(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
  }
  return undefined;
}

/** JPEG: the first SOFn frame size, axes swapped when an APP1 Exif orientation rotates by 90°. */
function jpegSize(b: Buffer): { w: number; h: number } | undefined {
  let at = 2;
  let orientation = 1;
  let dims: { w: number; h: number } | undefined;
  while (at + 3 < b.length && b[at] === 0xff) {
    while (b[at] === 0xff) at++;
    const marker = b[at++]!;
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan: no header follows
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // standalone markers
    if (at + 2 > b.length) break;
    const length = b.readUInt16BE(at);
    if (length < 2 || at + length > b.length) break;
    if (marker === 0xe1) orientation = exifOrientation(b, at + 2, at + length) ?? orientation;
    // SOF0–15 except DHT (c4), JPG (c8) and DAC (cc): precision, height, width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && length >= 7) {
      const w = b.readUInt16BE(at + 5);
      const h = b.readUInt16BE(at + 3);
      dims ??= w > 0 && h > 0 ? { w, h } : undefined;
    }
    at += length;
  }
  return dims && orientation >= 5 ? { w: dims.h, h: dims.w } : dims;
}

/** The TIFF `Orientation` tag (1–8) of an APP1 `Exif\0\0` segment in `[start, end)`. */
function exifOrientation(b: Buffer, start: number, end: number): number | undefined {
  if (start + 14 > end || b.toString("latin1", start, start + 6) !== "Exif\0\0") return undefined;
  const tiff = start + 6;
  const order = b.toString("latin1", tiff, tiff + 2);
  if (order !== "II" && order !== "MM") return undefined;
  const le = order === "II";
  const u16 = (o: number) => (o + 2 > end ? undefined : le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (o: number) => (o + 4 > end ? undefined : le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const offset = u32(tiff + 4);
  if (u16(tiff + 2) !== 42 || offset === undefined) return undefined;
  const ifd = tiff + offset;
  const count = u16(ifd) ?? 0;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    // Tag 0x0112, type SHORT, count 1: the value sits in the first two bytes of the value field.
    if (u16(entry) !== 0x0112 || u16(entry + 2) !== 3 || u32(entry + 4) !== 1) continue;
    const value = u16(entry + 8)!;
    return value >= 1 && value <= 8 ? value : undefined;
  }
  return undefined;
}
