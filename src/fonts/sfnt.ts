import { inflateSync } from "node:zlib";
import type { FaceMetrics } from "../model/fonts.ts";

export interface SfntTable {
  offset: number;
  length: number;
  checksum: number;
  data: Uint8Array;
}

export interface SfntFont {
  sfntVersion: number;
  tables: Map<string, SfntTable>;
}

export interface ExtractedFontData {
  metrics: FaceMetrics;
  axes: Record<string, [number, number]>;
  names: Map<number, string>;
}

/** OpenType table checksum: sum of 32-bit big-endian words, padded with zero bytes. */
export function tableChecksum(bytes: Uint8Array, offset: number, length: number): number {
  let sum = 0 >>> 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, length);
  const n32 = Math.floor(length / 4);
  for (let i = 0; i < n32; i++) {
    sum = (sum + view.getUint32(i * 4)) >>> 0;
  }
  const rem = length % 4;
  if (rem > 0) {
    let last = 0;
    const base = offset + n32 * 4;
    for (let i = 0; i < rem; i++) {
      last |= bytes[base + i]! << (24 - i * 8);
    }
    sum = (sum + (last >>> 0)) >>> 0;
  }
  return sum;
}

/** Parses the 12-byte SFNT header and table directory into a table map. */
export function parseSfnt(bytes: Uint8Array): SfntFont {
  if (bytes.length < 12) throw new Error("font too short for SFNT header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sfntVersion = view.getUint32(0);
  const numTables = view.getUint16(4);
  if (bytes.length < 12 + numTables * 16) throw new Error("font truncated in table directory");

  const tables = new Map<string, SfntTable>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
    const checksum = view.getUint32(o + 4);
    const offset = view.getUint32(o + 8);
    const length = view.getUint32(o + 12);
    if (offset + length > bytes.length) throw new Error(`table ${tag} extends beyond font buffer`);
    tables.set(tag, {
      offset,
      length,
      checksum,
      data: bytes.subarray(offset, offset + length),
    });
  }
  return { sfntVersion, tables };
}

/**
 * Reassembles an SFNT font from its tables, sorting the directory alphabetically,
 * 4-byte padding each table, updating checksums, and calculating head.checkSumAdjustment.
 */
export function assembleSfnt(sfntVersion: number, tables: Map<string, Uint8Array | SfntTable>): Uint8Array {
  const sortedTags = Array.from(tables.keys()).sort();
  const numTables = sortedTags.length;
  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  const rangeShift = numTables * 16 - searchRange;

  let offset = 12 + numTables * 16;
  const dirRecords: Array<{ tag: string; checksum: number; offset: number; length: number }> = [];
  const tableDataList: Uint8Array[] = [];

  for (const tag of sortedTags) {
    const entry = tables.get(tag)!;
    const raw = entry instanceof Uint8Array ? entry : entry.data;
    const pad = (4 - (raw.length % 4)) % 4;
    const length = raw.length;
    const checksum = tableChecksum(raw, 0, length);
    dirRecords.push({ tag, checksum, offset, length });
    tableDataList.push(raw);
    if (pad > 0) tableDataList.push(new Uint8Array(pad));
    offset += length + pad;
  }

  const out = new Uint8Array(offset);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(0, sfntVersion);
  view.setUint16(4, numTables);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, rangeShift);

  for (let i = 0; i < dirRecords.length; i++) {
    const r = dirRecords[i]!;
    const o = 12 + i * 16;
    for (let c = 0; c < 4; c++) out[o + c] = r.tag.charCodeAt(c);
    view.setUint32(o + 4, r.checksum);
    view.setUint32(o + 8, r.offset);
    view.setUint32(o + 12, r.length);
  }

  let pos = 12 + numTables * 16;
  for (const td of tableDataList) {
    out.set(td, pos);
    pos += td.length;
  }

  // Recalculate head.checkSumAdjustment per OpenType spec
  const headIdx = dirRecords.findIndex((r) => r.tag === "head");
  if (headIdx !== -1) {
    const headRec = dirRecords[headIdx]!;
    view.setUint32(headRec.offset + 8, 0); // clear existing checkSumAdjustment
    const fullSum = tableChecksum(out, 0, out.length);
    const adjust = (0xb1b0afba - fullSum) >>> 0;
    view.setUint32(headRec.offset + 8, adjust);

    // Update head table checksum in directory
    const newHeadChecksum = tableChecksum(out, headRec.offset, headRec.length);
    view.setUint32(12 + headIdx * 16 + 4, newHeadChecksum);
  }

  return out;
}

export interface NameRecordItem {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  str: string;
  rawBytes?: Uint8Array;
}

/** Decodes existing name table records and extracts family/subfamily strings. */
export function readNameTable(nameTableBytes: Uint8Array): {
  format: number;
  records: NameRecordItem[];
  names: Map<number, string>;
} {
  const view = new DataView(nameTableBytes.buffer, nameTableBytes.byteOffset, nameTableBytes.byteLength);
  const format = view.getUint16(0);
  const count = view.getUint16(2);
  const stringOffset = view.getUint16(4);
  const records: NameRecordItem[] = [];
  const names = new Map<number, string>();

  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    const platformID = view.getUint16(o);
    const encodingID = view.getUint16(o + 2);
    const languageID = view.getUint16(o + 4);
    const nameID = view.getUint16(o + 6);
    const length = view.getUint16(o + 8);
    const offset = view.getUint16(o + 10);
    const rawBytes = nameTableBytes.subarray(stringOffset + offset, stringOffset + offset + length);

    let str = "";
    try {
      if (platformID === 3 || platformID === 0) {
        str = new TextDecoder("utf-16be").decode(rawBytes);
      } else {
        str = new TextDecoder("latin1").decode(rawBytes);
      }
    } catch {
      // Keep unreadable records with rawBytes preserved
    }

    records.push({ platformID, encodingID, languageID, nameID, str, rawBytes });
    if (str && (!names.has(nameID) || platformID === 3)) {
      names.set(nameID, str);
    }
  }

  return { format, records, names };
}

/**
 * Rewrites the name table so the font resolves under the given CSS family name on Apple platforms.
 * Stale records for IDs 1, 2, 4, 6 (and 16, 17 for variable fonts) are dropped and replaced
 * with Windows Unicode BMP (3, 1, 0x0409) and Mac Roman (1, 0, 0) records.
 */
export function buildRewrittenNameTable(
  existingRecords: NameRecordItem[],
  family: string,
  subfamily: string,
  hasFvar: boolean,
): Uint8Array {
  const dropIds = new Set(hasFvar ? [1, 2, 4, 6, 16, 17] : [1, 2, 4, 6]);
  const kept = existingRecords.filter((r) => !dropIds.has(r.nameID));

  const ps = family.replace(/[^A-Za-z0-9]/g, "") + (subfamily !== "Regular" ? `-${subfamily.replace(/\s+/g, "")}` : "");
  const full = subfamily === "Regular" ? family : `${family} ${subfamily}`;

  const newNames: Record<number, string | undefined> = {
    1: family,
    2: subfamily,
    4: full,
    6: ps.slice(0, 63),
    ...(hasFvar ? { 16: family, 17: subfamily } : {}),
  };

  // Mac Roman records hold ASCII names only (written as UTF-8 they would garble "Söhne"); Windows records carry all.
  const ascii = Object.values(newNames).every((n) => n === undefined || /^[\x20-\x7e]*$/.test(n));
  const platforms = [
    { platformID: 3, encodingID: 1, languageID: 0x0409, utf16: true },
    ...(ascii ? [{ platformID: 1, encodingID: 0, languageID: 0, utf16: false }] : []),
  ];

  const additions: Array<NameRecordItem & { utf16: boolean }> = [];
  for (const p of platforms) {
    for (const [nameIDStr, str] of Object.entries(newNames)) {
      if (str === undefined) continue;
      const nameID = Number(nameIDStr);
      additions.push({
        platformID: p.platformID,
        encodingID: p.encodingID,
        languageID: p.languageID,
        nameID,
        str,
        utf16: p.utf16,
      });
    }
  }

  // OpenType spec: NameRecords must be sorted by platformID, encodingID, languageID, nameID
  const all = [...kept, ...additions].sort(
    (a, b) =>
      a.platformID - b.platformID || a.encodingID - b.encodingID || a.languageID - b.languageID || a.nameID - b.nameID,
  );

  const stringParts: Uint8Array[] = [];
  let curOffset = 0;
  const dir: Array<{
    platformID: number;
    encodingID: number;
    languageID: number;
    nameID: number;
    length: number;
    offset: number;
  }> = [];

  for (const item of all) {
    let strBytes: Uint8Array;
    if ("utf16" in item) {
      if (item.utf16) {
        const buf = new Uint8Array(item.str.length * 2);
        const v = new DataView(buf.buffer);
        for (let i = 0; i < item.str.length; i++) v.setUint16(i * 2, item.str.charCodeAt(i));
        strBytes = buf;
      } else {
        strBytes = new TextEncoder().encode(item.str);
      }
    } else if (item.rawBytes) {
      strBytes = item.rawBytes;
    } else {
      strBytes = new TextEncoder().encode(item.str);
    }

    dir.push({
      platformID: item.platformID,
      encodingID: item.encodingID,
      languageID: item.languageID,
      nameID: item.nameID,
      length: strBytes.length,
      offset: curOffset,
    });
    stringParts.push(strBytes);
    curOffset += strBytes.length;
  }

  const stringOffset = 6 + dir.length * 12;
  const out = new Uint8Array(stringOffset + curOffset);
  const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
  outView.setUint16(0, 0); // format 0
  outView.setUint16(2, dir.length);
  outView.setUint16(4, stringOffset);

  for (let i = 0; i < dir.length; i++) {
    const r = dir[i]!;
    const o = 6 + i * 12;
    outView.setUint16(o, r.platformID);
    outView.setUint16(o + 2, r.encodingID);
    outView.setUint16(o + 4, r.languageID);
    outView.setUint16(o + 6, r.nameID);
    outView.setUint16(o + 8, r.length);
    outView.setUint16(o + 10, r.offset);
  }

  let pos = stringOffset;
  for (const sp of stringParts) {
    out.set(sp, pos);
    pos += sp.length;
  }

  return out;
}

/** Extracts typographic and variation metrics from head, hhea, OS/2 and fvar tables. */
export function extractFontMetrics(
  bytes: Uint8Array,
  tables: Map<string, SfntTable>,
): {
  metrics: FaceMetrics;
  axes: Record<string, [number, number]>;
} {
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const os2 = tables.get("OS/2");
  if (!head || !hhea || !os2) throw new Error("font missing required metrics table (head/hhea/OS/2)");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const upem = view.getUint16(head.offset + 18);
  const hheaAscender = view.getInt16(hhea.offset + 4);
  const hheaDescender = view.getInt16(hhea.offset + 6);
  const hheaLineGap = view.getInt16(hhea.offset + 8);

  const os2Version = view.getUint16(os2.offset);
  const fsSelection = view.getUint16(os2.offset + 62);
  const sTypoAscender = view.getInt16(os2.offset + 68);
  const sTypoDescender = view.getInt16(os2.offset + 70);
  const sTypoLineGap = view.getInt16(os2.offset + 72);

  const typo = Boolean(fsSelection & (1 << 7)) && os2Version >= 4;
  const ascent = typo ? sTypoAscender : hheaAscender;
  const descent = typo ? Math.abs(sTypoDescender) : Math.abs(hheaDescender);
  const lineGap = typo ? sTypoLineGap : hheaLineGap;

  const axes: Record<string, [number, number]> = {};
  const fvar = tables.get("fvar");
  if (fvar) {
    const offsetToData = view.getUint16(fvar.offset + 4);
    const axisCount = view.getUint16(fvar.offset + 8);
    const axisSize = view.getUint16(fvar.offset + 10);
    for (let i = 0; i < axisCount; i++) {
      const aOff = fvar.offset + offsetToData + i * axisSize;
      const tag = String.fromCharCode(bytes[aOff]!, bytes[aOff + 1]!, bytes[aOff + 2]!, bytes[aOff + 3]!);
      const min = view.getInt32(aOff + 4) / 65536;
      const max = view.getInt32(aOff + 12) / 65536;
      axes[tag] = [min, max];
    }
  }

  return {
    metrics: { upem, ascent, descent, lineGap, useTypoMetrics: typo },
    axes,
  };
}

/** Decompresses a WOFF 1.0 font stream into standard SFNT (TTF/OTF) bytes. */
export function decompressWoff1(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 44) throw new Error("WOFF header truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0);
  if (magic !== 0x774f4646) throw new Error("invalid WOFF 1.0 signature");

  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  if (bytes.length < 44 + numTables * 20) throw new Error("WOFF table directory truncated");

  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
    const offset = view.getUint32(o + 4);
    const compLength = view.getUint32(o + 8);
    const origLength = view.getUint32(o + 12);

    if (offset + compLength > bytes.length) throw new Error(`WOFF table ${tag} truncated`);
    const compData = bytes.subarray(offset, offset + compLength);
    const tableData = compLength < origLength ? new Uint8Array(inflateSync(compData)) : compData;
    tables.set(tag, tableData);
  }

  return assembleSfnt(flavor, tables);
}
