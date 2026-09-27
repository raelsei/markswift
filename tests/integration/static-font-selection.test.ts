import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertHtml } from "../../src/index.ts";
import { compileLayout, compileLayouts } from "../../src/compiler/index.ts";
import { FONT_RUNTIME } from "../../src/swift/font-runtime.ts";
import { typecheck, TYPECHECK_TARGET } from "../../tools/verify/typecheck.ts";
import { writeStaticFont } from "../helpers/static-font-assets.ts";
import { textLineBoxFixture } from "../helpers/text-line-box-fixture.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

browserTest("live Chrome computed weights and source face choices survive capture/package/emission", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-css-font-matching-"));
  try {
    const [regular, bold] = await Promise.all([writeStaticFont(dir, 400), writeStaticFont(dir, 700)]);
    const url = async (file: string) => `data:font/ttf;base64,${(await readFile(file)).toString("base64")}`;
    const css = `@font-face{font-family:"Captured Family";font-weight:400;src:url("${await url(regular)}")}
      @font-face{font-family:"Captured Family";font-weight:700;src:url("${await url(bold)}")}
      #sample{font:18px/24px "Captured Family";font-synthesis:none;font-optical-sizing:none}
      p{margin:0} button{font:inherit} #unsupported{font-synthesis:weight style}`;
    const observations: Record<string, string[]> = {};
    const computedWeights: Record<string, string> = {};
    const result = await convertHtml(`<main id="sample" data-markswift-root>
      <p id="w400" style="font-weight:400">AAAA</p><p id="w500" style="font-weight:500">AAAA</p>
      <p id="w50001" style="font-weight:500.01"><span>AAAA</span></p><p id="w5005" style="font-weight:500.5"><span>AAAA</span></p><p id="w550" style="font-weight:550">AAAA</p>
      <p id="w50001direct" style="font-weight:500.01">AAAA</p><p id="w5005direct" style="font-weight:500.5">AAAA</p>
      <button id="w700" style="font-weight:700">AAAA</button><p id="unsupported">AAAA</p></main>`, {
      css, name: "StaticFontProof", mode: "fidelity", async prepare(page) {
        await page.evaluate(() => document.fonts.ready);
        const session = await page.context().newCDPSession(page);
        await session.send("DOM.enable"); await session.send("CSS.enable");
        const { root } = await session.send("DOM.getDocument");
        for (const id of ["w400", "w500", "w50001", "w5005", "w50001direct", "w5005direct", "w550", "w700"]) {
          const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: `#${id}` });
          const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
          observations[id] = fonts.filter(font => font.glyphCount > 0).map(font => font.postScriptName);
          computedWeights[id] = await page.locator(`#${id}`).evaluate(node => getComputedStyle(node).fontWeight);
        }
        await session.detach();
      },
    });
    // Blink currently rounds authored500.01 to computed500; retain that actual capture fact.
    expect(computedWeights).toEqual({ w400: "400", w500: "500", w50001: "500", w5005: "500.5", w50001direct: "500", w5005direct: "500.5", w550: "550", w700: "700" });
    expect(observations).toEqual({ w400: ["OriginalTest-400"], w500: ["OriginalTest-400"], w50001: ["OriginalTest-400"], w5005: ["OriginalTest-700"], w50001direct: ["OriginalTest-400"], w5005direct: ["OriginalTest-700"], w550: ["OriginalTest-700"], w700: ["OriginalTest-700"] });
    expect(result.code).toContain('weight: 500.0, staticFace: "CapturedFamily"');
    expect(result.code).not.toContain('weight: 500.01');
    expect(result.code).toContain('weight: 500.5, staticFace: "CapturedFamily-Bold"');
    expect(result.code).toContain('weight: 550.0, staticFace: "CapturedFamily-Bold"');
    expect(result.code).toContain('weight: 700.0, staticFace: "CapturedFamily-Bold"');
    expect(result.diagnostics.flatMap(node => node.notes).some(note => note.includes("font-synthesis:none is not captured"))).toBe(true);
    expect(result.diagnostics.flatMap(node => node.notes).some(note => note.includes("app Dynamic Type"))).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);

nativeTest("full static/variable app and fidelity bundles compile in strict Swift 6 without changing app views", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-static-font-sdk-"));
  try {
    const layout = textLineBoxFixture();
    Object.assign(layout.root.styles, { "font-family": "Captured", "font-style": "normal", "font-stretch": "100%", "font-synthesis": "none", "font-weight": "500.01" });
    const weight: [number, number] = [400, 700];
    const faces = [400, 700].map(value => ({ weight: [value, value] as [number, number], style: "normal" as const, axes: {}, postScriptName: `PublicFace${value}`, assetHash: "a".repeat(64) }));
    const catalog = { Captured: { weight, faces } };
    expect(compileLayout(layout, { mode: "app", bundledFamilies: catalog }).code).toBe(compileLayout(layout, { mode: "app", bundledFamilies: { Captured: { weight } } }).code);
    const bundle = compileLayouts([
      { layout, name: "StaticApp", mode: "app", bundledFamilies: catalog },
      { layout, name: "StaticFidelity", mode: "fidelity", bundledFamilies: catalog },
      ...(["app", "fidelity"] as const).map(mode => ({ layout, name: mode === "app" ? "VariableApp" : "VariableFidelity", mode,
        bundledFamilies: { Captured: { weight, opsz: [8, 72] as [number, number], faces: [{ ...faces[0]!, axes: { wght: [100, 900] as [number, number] } }] } } })),
    ]);
    for (const [file, source] of Object.entries(bundle.files)) await writeFile(join(dir, file), source);
    await writeFile(join(dir, "FontResolverProbe.swift"), `import SwiftUI\nimport UIKit\nimport CoreText\nfunc publicFontResolverProbe() {\n _ = MarkswiftBundledFont.resolve("Captured", size: 18, weight: 500.01, staticFace: "PublicFace700")\n _ = MarkswiftBundledFont.resolve("Variable", size: 18, weight: 650.125, opsz: 18)\n}\n`);
    for (const ios of ["17.0", "18.0"]) {
      const result = await typecheck(dir, { ...TYPECHECK_TARGET, ios });
      expect(result.ok, result.output).toBe(true);
    }
    expect(FONT_RUNTIME).not.toContain("UIFontDescriptor.TraitKey.weight");
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 60000);
