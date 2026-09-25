/** Intrinsic pixel dimensions from common raster headers; no image decoder dependency. */
export function rasterDimensions(bytes: Buffer): { w: number; h: number } | undefined {
  const size = (w: number, h: number) => w > 0 && h > 0 ? { w, h } : undefined;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString("ascii", 12, 16) === "IHDR")
    return size(bytes.readUInt32BE(16), bytes.readUInt32BE(20));

  if (bytes.length >= 10 && /^(GIF87a|GIF89a)$/.test(bytes.toString("ascii", 0, 6)))
    return size(bytes.readUInt16LE(6), bytes.readUInt16LE(8));

  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 3 < bytes.length) {
      if (bytes[at++] !== 0xff) break;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (at + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7
        || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf) && length >= 7)
        return size(bytes.readUInt16BE(at + 5), bytes.readUInt16BE(at + 3));
      at += length;
    }
  }

  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
      return size(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
    if (chunk === "VP8L" && bytes[20] === 0x2f)
      return size(1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8),
        1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10));
    if (chunk === "VP8X")
      return size(1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
        1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16));
  }
  return undefined;
}
