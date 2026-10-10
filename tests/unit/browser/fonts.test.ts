import { expect, test } from "bun:test";
import { readFontBytes } from "../../../src/browser/fonts.ts";
import type { FontFace } from "../../../src/model/layout.ts";

test("font sources outside http(s) are never read by the host", async () => {
  const face: FontFace = { family: "Probe", style: "normal", weight: [400, 400], loaded: true, src: [{ url: "file:///etc/hosts" }, { url: "s3://bucket/x.ttf" }] };
  expect(await readFontBytes([face])).toEqual([]);
  expect(face.src.every((s) => s.file === undefined)).toBe(true);
});
