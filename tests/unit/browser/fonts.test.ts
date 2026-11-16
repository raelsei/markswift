import { expect, test } from "bun:test";
import { readFontBytes } from "../../../src/browser/fonts.ts";
import type { FontFace } from "../../../src/model/layout.ts";

test("font sources outside http(s) are never read by the host", async () => {
  const face: FontFace = {
    family: "Probe",
    style: "normal",
    weight: [400, 400],
    loaded: true,
    src: [{ url: "file:///etc/hosts" }, { url: "s3://bucket/x.ttf" }],
  };
  expect(await readFontBytes([face])).toEqual([]);
  expect(face.src.every((s) => s.file === undefined)).toBe(true);
});

test("browser response font bytes are packaged directly without fetch", async () => {
  // Mock font response bytes with WOFF2 magic header 'wOF2'
  const woff2Bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00]);
  const responses = new Map<string, Uint8Array>([["https://example.com/fonts/inter.woff2", woff2Bytes]]);
  const face: FontFace = {
    family: "Inter",
    style: "normal",
    weight: [400, 400],
    loaded: true,
    src: [{ url: "https://example.com/fonts/inter.woff2#fragment" }],
  };

  // Even with allowRemote = false, responses are used!
  const result = await readFontBytes([face], false, undefined, responses);
  expect(result.length).toBe(1);
  expect(result[0]!.file).toMatch(/^_fonts\/[0-9a-f]{12}\.woff2$/);
  expect(result[0]!.bytes).toEqual(woff2Bytes);
  expect(face.src[0]!.file).toBe(result[0]!.file);
});
