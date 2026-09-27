import { expect, test } from "bun:test";
import sharp from "sharp";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

const svg = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100" viewBox="0 0 150 100"><path d="M0 0 H150 V100 H0 Z" fill="blue"/></svg>',
);

function layout(fit: "cover" | "contain", width: string, position = "50% 50%", src = svg): LayoutDoc {
  return {
    version: 1, source: "image-fit.html", combo: { screen: "image-fit", theme: "light", demoState: "normal" },
    size: { w: 200, h: 125 }, dpr: 1, canvas: "white", fonts: [],
    root: {
      id: "root", tag: "main", attrs: {}, styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 200, h: 125 }, children: [{
        id: "#image", tag: "img", attrs: { src, alt: fit, style: `width:${width};height:125px;object-position:${position}` },
        styles: { display: "block", width: "200px", height: "125px", "object-fit": fit, "object-position": position },
        preferredSize: { width, height: "125px" }, bounds: { x: 0, y: 0, w: 200, h: 125 }, children: [],
      }],
    },
  };
}

test.each(["app", "fidelity"] as const)("%s font diagnostics follow painted alt text, not an image's inherited font", mode => {
  for (const [src, alt, paintsText] of [[svg, "Picture", false], ["", "Missing picture", true], ["", "", false]] as const) {
    const doc = layout("contain", "200px", "50% 50%", src), image = doc.root.children[0]!;
    image.attrs.alt = alt;
    Object.assign(image.styles, { "font-family": "Times", "font-size": "16px", "font-weight": "400" });
    const result = compileLayout(doc, { name: "ImageFontOwnership", mode });
    const notes = result.diagnostics.find(node => node.id === "#image")?.notes ?? [];
    expect(notes.some(note => note.includes("concrete font-family Times"))).toBe(paintsText);
    expect(result.code.includes('Text(verbatim: "Missing picture")')).toBe(paintsText);
  }
});

test("a decorative background box has no font substitution diagnostic", () => {
  const doc = layout("contain", "200px");
  doc.root.children = [];
  Object.assign(doc.root.styles, { "font-family": "Times", "font-size": "16px", "background-image": `url("${svg}")` });
  const result = compileLayout(doc, { name: "BackgroundFontOwnership" });
  expect(result.diagnostics.flatMap(node => node.notes).some(note => note.includes("font-family Times"))).toBe(false);
  expect(result.code).not.toContain("Text(verbatim:");
});

test("flexible SVG cover and contain use the live image box in app mode", () => {
  for (const [fit, scale] of [["cover", "max"], ["contain", "min"]] as const) {
    const result = compileLayout(layout(fit, "100%"), { name: "ResponsiveVector", mode: "app" });
    expect(result.code).toContain("GeometryReader { geometry in");
    expect(result.code).toContain(`.scaleEffect(${scale}(geometry.size.width / 150.0, geometry.size.height / 100.0))`);
    expect(result.code).toContain(".frame(width: geometry.size.width, height: geometry.size.height)");
    expect(result.code).toContain(`.accessibilityLabel("${fit}")`);
    expect(result.files["MarkswiftShapes.swift"]).toContain("MarkswiftShape_");
    expect(result.diagnostics.some(item => item.id === "#image")).toBe(false);
  }
});

test("fixed app and fidelity SVG boxes keep their measured cover artwork", () => {
  for (const [mode, width] of [["app", "200px"], ["fidelity", "100%"]] as const) {
    const code = compileLayout(layout("cover", width), { name: "FixedVector", mode }).code;
    expect(code).not.toContain("GeometryReader { geometry in");
    expect(code).toContain(".frame(width: 200.0, height: 133.333)");
  }
});

test("inline PNG and JPEG cover/contain use intrinsic dimensions and CSS edge position in a live box", async () => {
  const pixels = Buffer.from([255, 0, 0, 0, 0, 255]);
  for (const format of ["png", "jpeg"] as const) {
    const bytes = await sharp(pixels, { raw: { width: 2, height: 1, channels: 3 } })[format]().toBuffer();
    const src = `data:image/${format};base64,${bytes.toString("base64")}`;
    for (const [fit, position, method, anchor] of [
      ["cover", "left top", "max", "0.0"],
      ["contain", "right bottom", "min", "1.0"],
    ] as const) {
      const result = compileLayout(layout(fit, "100%", position, src), { name: "PositionedRaster", mode: "app" });
      expect(result.code).toContain(`let scale = ${method}(geometry.size.width / 2.0, geometry.size.height / 1.0)`);
      expect(result.code).toContain(`.offset(x: (geometry.size.width - drawnWidth) * ${anchor}, y: (geometry.size.height - drawnHeight) * ${anchor})`);
      if (fit === "cover") expect(result.code).toContain(".clipped()");
      expect(result.diagnostics.some(item => item.id === "#image")).toBe(false);
    }
  }
});

test("positioned SVG cover supports fixed and live image boxes without changing centered output", () => {
  const fixed = compileLayout(layout("cover", "200px", "left top"), { name: "PositionedVector", mode: "app" });
  expect(fixed.code).toContain(".frame(width: 200.0, height: 133.333)");
  expect(fixed.code).toContain(".offset(x: 0.0, y: 4.167)");
  expect(fixed.diagnostics.some(item => item.id === "#image")).toBe(false);

  const live = compileLayout(layout("contain", "100%", "right bottom"), { name: "PositionedVector", mode: "app" });
  expect(live.code).toContain(".scaleEffect(scale)");
  expect(live.code).toContain(".offset(x: (geometry.size.width - 150.0 * scale) * 0.5, y: (geometry.size.height - 100.0 * scale) * 0.5)");
  expect(live.diagnostics.some(item => item.id === "#image")).toBe(false);

  const centered = compileLayout(layout("cover", "200px"), { name: "CenteredVector", mode: "app" });
  expect(centered.code).not.toContain(".offset(x:");
});

test("unsupported object-position values remain an explicit approximation", () => {
  const result = compileLayout(layout("cover", "200px", "left 10px"), { name: "UnsupportedPosition" });
  expect(result.diagnostics.find(item => item.id === "#image")?.notes.join(" ")).toContain("position syntax unsupported");
  expect(result.code).toContain(".overlay(alignment: .center)");
});

test("effective pixelated and crisp-edge paint preserve nearest sampling across raster source routes", async () => {
  const png = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), { raw: { width: 2, height: 1, channels: 3 } }).png().toBuffer();
  for (const src of [`data:image/png;base64,${png.toString("base64")}`, "https://example.test/art.png", "art.png"]) {
    for (const sampling of ["pixelated", "crisp-edges", "auto", "smooth"] as const) {
      const doc = layout("cover", "200px", "left top", src);
      doc.root.children[0]!.styles["image-rendering"] = sampling;
      for (const mode of ["app", "fidelity"] as const) {
        const code = compileLayout(doc, { name: "RasterSampling", mode }).code;
        expect(code.includes(".interpolation(.none)")).toBe(sampling === "pixelated" || sampling === "crisp-edges");
      }
    }
  }
  const vector = layout("cover", "200px");
  vector.root.children[0]!.styles["image-rendering"] = "pixelated";
  expect(compileLayout(vector, { name: "VectorSampling" }).code).not.toContain(".interpolation(.none)");
});

test("nearest sampling also applies to repeated and positioned background raster layers", async () => {
  const png = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), { raw: { width: 2, height: 1, channels: 3 } }).png().toBuffer();
  for (const repeat of ["repeat", "no-repeat"]) {
    const doc = layout("cover", "200px");
    doc.root.children = [];
    Object.assign(doc.root.styles, { "image-rendering": "pixelated", "background-image": `url("data:image/png;base64,${png.toString("base64")}")`,
      "background-size": "20px 10px", "background-repeat": repeat, "background-position": "0px 0px" });
    const code = compileLayout(doc, { name: "BackgroundSampling" }).code;
    expect(code).toContain(".interpolation(.none).resizable()");
  }
});
