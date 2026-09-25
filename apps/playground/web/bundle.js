const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, seed) => {
  let value = seed;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function base64Bytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safePath(path) {
  const segments = path.replaceAll("\\", "/").split("/").filter((part) => part && part !== "." && part !== "..");
  return segments.join("/") || "asset";
}

/** Store-only ZIP: generated Swift and font assets need no additional dependency. */
export function bundleZip(files, assets = {}) {
  const entries = [
    ...Object.entries(files).map(([path, source]) => [safePath(path), encoder.encode(source)]),
    ...Object.entries(assets).map(([path, base64]) => [safePath(path), base64Bytes(base64)]),
  ];
  const localParts = [];
  const directoryParts = [];
  let localOffset = 0;

  for (const [path, bytes] of entries) {
    const name = encoder.encode(path);
    const checksum = crc32(bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x800, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, bytes);

    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint16(8, 0x800, true);
    directoryView.setUint16(14, 0x21, true);
    directoryView.setUint32(16, checksum, true);
    directoryView.setUint32(20, bytes.length, true);
    directoryView.setUint32(24, bytes.length, true);
    directoryView.setUint16(28, name.length, true);
    directoryView.setUint32(42, localOffset, true);
    directory.set(name, 46);
    directoryParts.push(directory);
    localOffset += local.length + bytes.length;
  }

  const directoryLength = directoryParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directoryLength, true);
  endView.setUint32(16, localOffset, true);
  return new Blob([...localParts, ...directoryParts, end], { type: "application/zip" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
