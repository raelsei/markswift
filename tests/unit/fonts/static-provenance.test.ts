import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { packageFonts } from "../../../src/fonts/package.ts";
import { bundledFamilies } from "../../../src/fonts/metadata.ts";
import type { FontPackage } from "../../../src/fonts/types.ts";
import { writeStaticFont } from "../../helpers/static-font-assets.ts";

test("packaged static metadata binds the final renamed public face to actual written asset bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-static-font-"));
  try {
    const src = await writeStaticFont(dir, 700);
    const pkg = await packageFonts([{ family: "Captured Family", style: "normal", weight: [700, 700], loaded: true,
      src: [{ url: "test.ttf", file: src }] }], join(dir, "swift"), dir);
    expect(pkg.faces).toHaveLength(1);
    const face = pkg.faces[0]!;
    expect(face.renamed).toBe(true);
    expect(face.postScriptName).toBe("CapturedFamily-Bold");
    const bytes = await readFile(join(dir, "swift", "Fonts", face.file));
    expect(face.assetHash).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(face.assetHash).not.toBe(createHash("sha256").update(await readFile(src)).digest("hex"));
    expect(bundledFamilies(pkg)["Captured Family"]!.faces).toEqual([{ style: "normal", weight: [700, 700], axes: {}, postScriptName: face.postScriptName, assetHash: face.assetHash }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the family catalog retains italic variable faces instead of pretending the family is static", () => {
  const metrics = { upem: 1000, ascent: 800, descent: 200, lineGap: 0, useTypoMetrics: false };
  const pkg: FontPackage = { faces: [
    { family: "Mixed", file: "normal.ttf", style: "normal" as const, weight: [400, 400] as [number, number], axes: {}, metrics, converted: false, renamed: false, postScriptName: "PublicNormal", assetHash: "a".repeat(64) },
    { family: "Mixed", file: "italic.ttf", style: "italic" as const, weight: [100, 900] as [number, number], axes: { wght: [100, 900] as [number, number] }, metrics, converted: false, renamed: false, postScriptName: "PublicItalic", assetHash: "b".repeat(64) },
  ], notes: [], plist: "", swift: "" };
  expect(bundledFamilies(pkg).Mixed!.faces).toHaveLength(2);
  expect(bundledFamilies(pkg).Mixed!.weight).toEqual([400, 400]);
  expect(bundledFamilies({ ...pkg, faces: [pkg.faces[1]!] })).toEqual({});
});

test("distinct CSS families cannot overwrite a packaged file or bind one public name to different assets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-font-collision-"));
  try {
    const src = await writeStaticFont(dir, 400);
    const collisions = await packageFonts(["Collision Font", "CollisionFont"].map(family => ({ family, style: "normal" as const,
      weight: [400, 400] as [number, number], loaded: true, src: [{ url: "test.ttf", file: src }] })), join(dir, "filename"), dir);
    expect(collisions.faces).toHaveLength(1);
    expect(collisions.notes.some(note => note.startsWith("unmapped:") && note.includes("filename collision"))).toBe(true);
    for (const face of collisions.faces) expect(face.assetHash).toBe(createHash("sha256").update(await readFile(join(dir, "filename/Fonts", face.file))).digest("hex"));
    const a = join(dir, "a"), b = join(dir, "b"); await mkdir(a); await mkdir(b);
    const originals = await Promise.all([writeStaticFont(a, 400, { family: "First Family", postScriptName: "SharedPublicFace" }), writeStaticFont(b, 700, { family: "Second Family", postScriptName: "SharedPublicFace" })]);
    const names = await packageFonts(originals.map((file, i) => ({ family: i ? "Second Family" : "First Family", style: "normal" as const,
      weight: [i ? 700 : 400, i ? 700 : 400] as [number, number], loaded: true, src: [{ url: "test.ttf", file }] })), join(dir, "public-name"), dir);
    expect(names.faces).toHaveLength(1);
    expect(names.notes.some(note => note.startsWith("unmapped:") && note.includes("public-name collision"))).toBe(true);
    for (const face of names.faces) expect(face.assetHash).toBe(createHash("sha256").update(await readFile(join(dir, "public-name/Fonts", face.file))).digest("hex"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
