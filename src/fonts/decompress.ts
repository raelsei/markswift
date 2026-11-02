import wawoff2 from "wawoff2";
import { decompressWoff1 } from "./sfnt.ts";

export interface DecompressResult {
  bytes: Uint8Array;
  converted: boolean;
}

/**
 * Decompresses WOFF and WOFF2 fonts to standard SFNT (TTF/OTF) in memory.
 * Raw TrueType / OpenType font bytes pass through unchanged.
 */
export async function decompressFont(bytes: Uint8Array): Promise<DecompressResult> {
  if (bytes.length < 4) throw new Error("font buffer too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = view.getUint32(0);

  if (sig === 0x774f4632) {
    // 'wOF2'
    const decomp = await wawoff2.decompress(bytes);
    return { bytes: new Uint8Array(decomp), converted: true };
  }
  if (sig === 0x774f4646) {
    // 'wOFF'
    return { bytes: decompressWoff1(bytes), converted: true };
  }
  if (sig === 0x00010000 || sig === 0x4f54544f || sig === 0x74727565) {
    // TTF / OTF
    return { bytes, converted: false };
  }

  const hex = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
  throw new Error(`unrecognized font signature: ${JSON.stringify(hex)}`);
}
