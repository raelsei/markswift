import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { convertHtml } from "../../src/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import { visit } from "../../src/swift/traversal.ts";
import type { ImageNode } from "../../src/model/semantic.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const sdkTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" && process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

async function fixture(): Promise<string> {
  const png = await sharp({ create: { width: 8, height: 4, channels: 4, background: "#ff0000" } })
    .composite([{ input: await sharp({ create: { width: 4, height: 4, channels: 4, background: "#0000ff" } }).png().toBuffer(), left: 4, top: 0 }])
    .png().toBuffer();
  const src = `data:image/png;base64,${png.toString("base64")}`;
  return `<main id="root" data-markswift-root style="width:300px;display:flex;gap:8px;image-rendering:pixelated">
    <img id="inherited" src="${src}" alt="Inherited pixel sampling" style="width:65px;height:65px;object-fit:cover;object-position:left top">
    <img id="crisp" src="${src}" alt="Crisp sampling" style="width:65px;height:65px;image-rendering:crisp-edges">
    <img id="smooth" src="${src}" alt="Smooth sampling" style="width:65px;height:65px;image-rendering:auto">
  </main>`;
}

browserTest("inherited raster sampling survives actual computed capture without changing image fit", async () => {
  for (const mode of ["app", "fidelity"] as const) {
    const result = await convertHtml(await fixture(), { name: "RasterSampling", mode });
    const captured = new Map(result.layout.root.children.map(node => [node.attrs.id, node]));
    expect(captured.get("inherited")?.styles["image-rendering"]).toBe("pixelated");
    expect(captured.get("crisp")?.styles["image-rendering"]).toBe("crisp-edges");
    expect(captured.get("smooth")?.styles["image-rendering"]).toBe("auto");
    const images = new Map<string, ImageNode>();
    visit(inferScreen(result.layout, "RasterSampling").root, node => { if (node.kind === "image") images.set(node.id, node); });
    expect(images.get("#inherited")?.style.imageRendering).toBe("pixelated");
    expect(images.get("#crisp")?.style.imageRendering).toBe("crisp-edges");
    expect(images.get("#smooth")?.style.imageRendering).toBeUndefined();
    expect(images.get("#inherited")?.objectPosition).toEqual([0, 0]);
    expect(images.get("#inherited")?.intrinsicSize).toEqual([8, 4]);
    expect(result.code.match(/\.interpolation\(\.none\)/g)).toHaveLength(2);
    expect(result.code).toMatch(/\.interpolation\(\.none\)\.resizable\(\)/);
    expect(result.diagnostics.filter(item => ["#inherited", "#crisp", "#smooth"].includes(item.id))).toHaveLength(0);
  }
}, 60000);

sdkTest("complete app and fidelity raster sampling bundles typecheck on the iOS consumer target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-raster-sampling-"));
  try {
    for (const mode of ["app", "fidelity"] as const) {
      const result = await convertHtml(await fixture(), { name: "RasterSampling", mode });
      for (const [name, code] of Object.entries(result.files)) await writeFile(join(directory, name), code);
      const compiled = await typecheck(directory);
      expect(compiled.ok, compiled.output).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
