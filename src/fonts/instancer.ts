import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface HarfBuzzExports {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
  _initialize?: () => void;
  hb_blob_create: (data: number, length: number, mode: number, userData: number, destroy: number) => number;
  hb_blob_destroy: (blob: number) => void;
  hb_blob_get_data: (blob: number, lengthOut: number) => number;
  hb_blob_get_length: (blob: number) => number;
  hb_face_create: (blob: number, index: number) => number;
  hb_face_destroy: (face: number) => void;
  hb_face_reference_blob: (face: number) => number;
  hb_subset_input_create_or_fail: () => number;
  hb_subset_input_destroy: (input: number) => void;
  hb_subset_input_keep_everything: (input: number) => void;
  hb_subset_input_pin_axis_location: (input: number, face: number, tag: number, value: number) => number;
  hb_subset_input_pin_axis_to_default: (input: number, face: number, tag: number) => number;
  hb_subset_or_fail: (face: number, input: number) => number;
}

let harfbuzzPromise: Promise<HarfBuzzExports> | undefined;

function getHarfBuzz(): Promise<HarfBuzzExports> {
  if (!harfbuzzPromise) {
    harfbuzzPromise = (async () => {
      const wasmPath = require.resolve("harfbuzzjs/dist/harfbuzz-subset.wasm");
      const wasmBytes = await readFile(wasmPath);
      const { instance } = await WebAssembly.instantiate(wasmBytes);
      const hb = instance.exports as unknown as HarfBuzzExports;
      if (typeof hb._initialize === "function") hb._initialize();
      return hb;
    })();
  }
  return harfbuzzPromise;
}

function tagToNumber(tag: string): number {
  return (
    ((tag.charCodeAt(0) & 0xff) << 24) |
    ((tag.charCodeAt(1) & 0xff) << 16) |
    ((tag.charCodeAt(2) & 0xff) << 8) |
    (tag.charCodeAt(3) & 0xff)
  );
}

/**
 * Bakes the specified variation axis locations into the font outlines using HarfBuzz subsetter,
 * retaining every glyph and layout feature while eliminating variation tables (gvar, fvar, HVAR, MVAR).
 * Yields a compact static TrueType instance.
 */
export async function instanceVariableFont(
  ttfBytes: Uint8Array,
  axisPins: Record<string, number>,
): Promise<Uint8Array> {
  const hb = await getHarfBuzz();
  const fontBuffer = hb.malloc(ttfBytes.length);
  new Uint8Array(hb.memory.buffer).set(ttfBytes, fontBuffer);

  const blob = hb.hb_blob_create(fontBuffer, ttfBytes.length, 2 /* HB_MEMORY_MODE_WRITABLE */, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);

  const input = hb.hb_subset_input_create_or_fail();
  if (!input) {
    hb.hb_face_destroy(face);
    hb.free(fontBuffer);
    throw new Error("failed to allocate HarfBuzz subset input");
  }

  try {
    hb.hb_subset_input_keep_everything(input);
    for (const [tag, val] of Object.entries(axisPins)) {
      hb.hb_subset_input_pin_axis_location(input, face, tagToNumber(tag), val);
    }

    const subset = hb.hb_subset_or_fail(face, input);
    if (!subset) throw new Error("HarfBuzz instancing failed");

    try {
      const resultBlob = hb.hb_face_reference_blob(subset);
      const offset = hb.hb_blob_get_data(resultBlob, 0);
      const length = hb.hb_blob_get_length(resultBlob);
      const out = new Uint8Array(length);
      out.set(new Uint8Array(hb.memory.buffer).subarray(offset, offset + length));
      hb.hb_blob_destroy(resultBlob);
      return out;
    } finally {
      hb.hb_face_destroy(subset);
    }
  } finally {
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.free(fontBuffer);
  }
}

/**
 * Pins unused axes to their default values, dropping them from fvar/gvar
 * while keeping other axes variable.
 */
export async function dropUnusedAxes(ttfBytes: Uint8Array, unusedTags: string[]): Promise<Uint8Array> {
  if (!unusedTags.length) return ttfBytes;
  const hb = await getHarfBuzz();
  const fontBuffer = hb.malloc(ttfBytes.length);
  new Uint8Array(hb.memory.buffer).set(ttfBytes, fontBuffer);

  const blob = hb.hb_blob_create(fontBuffer, ttfBytes.length, 2, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);

  const input = hb.hb_subset_input_create_or_fail();
  if (!input) {
    hb.hb_face_destroy(face);
    hb.free(fontBuffer);
    throw new Error("failed to allocate HarfBuzz subset input");
  }

  try {
    hb.hb_subset_input_keep_everything(input);
    for (const tag of unusedTags) {
      hb.hb_subset_input_pin_axis_to_default(input, face, tagToNumber(tag));
    }

    const subset = hb.hb_subset_or_fail(face, input);
    if (!subset) throw new Error("HarfBuzz axis reduction failed");

    try {
      const resultBlob = hb.hb_face_reference_blob(subset);
      const offset = hb.hb_blob_get_data(resultBlob, 0);
      const length = hb.hb_blob_get_length(resultBlob);
      const out = new Uint8Array(length);
      out.set(new Uint8Array(hb.memory.buffer).subarray(offset, offset + length));
      hb.hb_blob_destroy(resultBlob);
      return out;
    } finally {
      hb.hb_face_destroy(subset);
    }
  } finally {
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.free(fontBuffer);
  }
}
