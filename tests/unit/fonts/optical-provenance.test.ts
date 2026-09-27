import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { packageFonts } from "../../../src/fonts/package.ts";
import { bundledFamilies, unionFaces } from "../../../src/fonts/metadata.ts";
import { fontOf, fontSelectionDiagnostic } from "../../../src/analysis/typography.ts";
import { writeOpticalFont } from "../../helpers/optical-font-assets.ts";
import type { FontFace } from "../../../src/model/layout.ts";

test("fvar defaults survive packaging alongside final asset identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-optical-default-"));
  try {
    const file = await writeOpticalFont(dir);
    const face = { family: "Optical", style: "normal" as const, weight: [100, 900] as [number, number], loaded: true, variationSettings: "normal", src: [{ url: "test.ttf", file }] };
    const pkg = await packageFonts([face], join(dir, "swift"), dir);
    expect(pkg.faces[0]!.axisDefaults).toEqual({ opsz: 20, wght: 400 });
    expect(pkg.faces[0]!.sourceVariations).toEqual(["normal"]);
    expect(pkg.faces[0]!.assetHash).toBe(createHash("sha256").update(await readFile(join(dir, "swift/Fonts", pkg.faces[0]!.file))).digest("hex"));
    const catalog = bundledFamilies(pkg);
    expect(catalog.Optical!.faces![0]!.axisDefaults).toEqual({ opsz: 20, wght: 400 });
    expect(fontOf({ "font-family": "Optical", "font-size": "32px", "font-weight": "650.25", "font-optical-sizing": "none", "font-variation-settings": "normal" }, catalog).opsz).toBe(20);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("capture union and package grouping preserve normal/24/unknown descriptor conflicts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-optical-conflict-"));
  try {
    const file = await writeOpticalFont(dir);
    const base = { family: "Optical", style: "normal" as const, weight: [100, 900] as [number, number], loaded: true, src: [{ url: "test.ttf", file }] };
    const faces: FontFace[] = [{ ...base, variationSettings: "normal" }, { ...base, variationSettings: '"opsz" 24' }, base];
    const joined = unionFaces(faces.map(face => ({ fonts: [face] })));
    expect(joined).toHaveLength(3);
    const pkg = await packageFonts(joined, join(dir, "swift"), dir), catalog = bundledFamilies(pkg);
    expect(pkg.faces).toHaveLength(1);
    expect(pkg.faces[0]!.sourceVariations).toContain("normal");
    expect(pkg.faces[0]!.sourceVariations).toContain('"opsz" 24');
    expect(pkg.faces[0]!.sourceVariations).toContain(null);
    expect(pkg.notes.some(note => note.includes("variation descriptor"))).toBe(true);
    const styles = { "font-family": "Optical", "font-size": "32px", "font-weight": "400", "font-optical-sizing": "none", "font-variation-settings": "normal" };
    expect(fontOf(styles, catalog).opsz).toBe(32);
    expect(fontSelectionDiagnostic(styles, catalog)).toContain("source variation descriptors");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
