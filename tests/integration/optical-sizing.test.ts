import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertHtml } from "../../src/index.ts";
import { compileLayout, compileLayouts } from "../../src/compiler/index.ts";
import { typecheck, TYPECHECK_TARGET } from "../../tools/verify/typecheck.ts";
import { writeOpticalFont } from "../helpers/optical-font-assets.ts";
import { textLineBoxFixture } from "../helpers/text-line-box-fixture.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

browserTest("live Chrome optical none/default, auto and source descriptor conflicts survive the actual pipeline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-optical-source-"));
  try {
    const file = await writeOpticalFont(dir), data = `data:font/ttf;base64,${(await readFile(file)).toString("base64")}`;
    const css = `@font-face{font-family:Optical;src:url("${data}");font-weight:100 900}
      @font-face{font-family:Conflicting;src:url("${data}");font-weight:100 900}
      @font-face{font-family:Conflicting;src:url("${data}");font-weight:100 900;font-variation-settings:"opsz" 24}
      #sample{width:400px;font:32px/48px Optical;font-optical-sizing:none;font-variation-settings:normal}
      p,button{box-sizing:border-box;margin:0;padding:0;width:400px;height:64px;font:inherit;border:0;background:white;color:black;text-align:left}
      #auto{font-optical-sizing:auto}#explicitDefault{font-variation-settings:"opsz" 20}#explicitMin{font-variation-settings:"opsz" 14}#conflict{font-family:Conflicting}`;
    const observed: Record<string, { width: number; optical: string; variation: string; names: string[] }> = {};
    const pixels: Record<string, Buffer> = {};
    const result = await convertHtml(`<main id="sample" data-markswift-root><p id="none">AAAA</p><p id="nested"><span>AAAA</span></p>
      <button id="caption">AAAA</button><p id="auto">AAAA</p><p id="explicitDefault">AAAA</p><p id="explicitMin">AAAA</p><p id="conflict">AAAA</p></main>`, {
      css, mode: "fidelity", name: "OpticalSource", async prepare(page) {
        await page.evaluate(() => document.fonts.ready);
        const session = await page.context().newCDPSession(page);
        await session.send("DOM.enable"); await session.send("CSS.enable"); const { root } = await session.send("DOM.getDocument");
        for (const id of ["none", "nested", "caption", "auto", "explicitDefault", "explicitMin", "conflict"]) {
          const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: `#${id}` });
          const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
          const source = await page.locator(`#${id}`).evaluate(node => {
            const styles = getComputedStyle(node), range = document.createRange(); range.selectNodeContents(node);
            return { width: range.getBoundingClientRect().width, optical: styles.fontOpticalSizing, variation: styles.fontVariationSettings };
          });
          observed[id] = { ...source, names: fonts.filter(font => font.glyphCount > 0).map(font => font.postScriptName) };
          if (["none", "explicitDefault", "explicitMin", "auto"].includes(id)) pixels[id] = await page.locator(`#${id}`).screenshot();
        }
        await session.detach();
      },
    });
    expect(observed.none!.optical).toBe("none"); expect(observed.none!.variation).toBe("normal");
    expect(observed.none!.names).toHaveLength(1);
    expect(observed.none!.width).toBe(observed.nested!.width);
    expect(observed.none!.width).toBe(observed.explicitDefault!.width);
    expect(pixels.none).toEqual(pixels.explicitDefault);
    expect(observed.none!.width).not.toBe(observed.explicitMin!.width);
    expect(observed.none!.width).not.toBe(observed.auto!.width);
    expect(pixels.none).not.toEqual(pixels.auto);
    expect(observed.conflict!.variation).toBe("normal");
    expect(observed.conflict!.width).not.toBe(observed.none!.width);
    expect(result.layout.fonts?.find(face => face.family === "Optical")?.variationSettings).toBe("normal");
    expect(result.layout.fonts?.filter(face => face.family === "Conflicting").map(face => face.variationSettings).sort()).toEqual(['"opsz" 24', "normal"]);
    expect(result.code).toContain('size: 32.0, weight: 400.0, opsz: 20.0');
    expect(result.code).toContain('size: 32.0, weight: 400.0, opsz: 32.0');
    expect(result.diagnostics.flatMap(node => node.notes).some(note => note.includes("source variation descriptors"))).toBe(true);
    expect(result.warnings.some(note => note.includes("variation descriptors"))).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);

nativeTest("complete admitted, declined and automatic optical bundles retain app output and strict SDK support", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-optical-sdk-"));
  try {
    const layout = textLineBoxFixture();
    Object.assign(layout.root.styles, { "font-family": "Optical", "font-weight": "650.25", "font-optical-sizing": "none", "font-variation-settings": "normal" });
    const face = { style: "normal" as const, weight: [100, 900] as [number, number], axes: { opsz: [14, 72] as [number, number], wght: [100, 900] as [number, number] },
      axisDefaults: { opsz: 20.00390625, wght: 400 }, sourceVariations: ["normal"], postScriptName: "PublicOptical", assetHash: "a".repeat(64) };
    const family = { weight: [100, 900] as [number, number], opsz: [14, 72] as [number, number], faces: [face] };
    const legacy = { Optical: { weight: family.weight, opsz: family.opsz } }, catalog = { Optical: family };
    expect(compileLayout(layout, { mode: "app", bundledFamilies: catalog }).code).toBe(compileLayout(layout, { mode: "app", bundledFamilies: legacy }).code);
    const auto = structuredClone(layout); auto.root.styles["font-optical-sizing"] = "auto";
    expect(compileLayout(auto, { mode: "fidelity", bundledFamilies: catalog }).code).toBe(compileLayout(auto, { mode: "fidelity", bundledFamilies: legacy }).code);
    const bundle = compileLayouts([
      { layout, name: "OpticalNoneApp", mode: "app", bundledFamilies: catalog },
      { layout, name: "OpticalNoneFidelity", mode: "fidelity", bundledFamilies: catalog },
      { layout: auto, name: "OpticalAutoFidelity", mode: "fidelity", bundledFamilies: catalog },
      { layout, name: "OpticalConflictFidelity", mode: "fidelity", bundledFamilies: { Optical: { ...family, faces: [{ ...face, sourceVariations: ["normal", '"opsz" 24'] }] } } },
    ]);
    expect(bundle.files["OpticalNoneFidelity.swift"]).toContain("opsz: 20.00390625");
    for (const [file, source] of Object.entries(bundle.files)) await writeFile(join(dir, file), source);
    for (const ios of ["17.0", "18.0"]) { const result = await typecheck(dir, { ...TYPECHECK_TARGET, ios }); expect(result.ok, result.output).toBe(true); }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);
