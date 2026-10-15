/** Plan 043 item 5: an embedded raster's header size places and tiles its background layer. */
import { describe, expect, test } from "bun:test";
import { imagePaint } from "../../../src/analysis/style-background.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { rasterSize } from "../../../src/css/index.ts";
import { LAYOUT_DOC_VERSION, type LayoutDoc } from "../../../src/model/layout.ts";

const url = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString("base64")}`;

function png(w: number, h: number): string {
  const b = Buffer.alloc(24);
  b.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return url("image/png", b);
}

/** Big-endian Exif APP1 with one Orientation entry, then an SOF0 frame header. */
function jpeg(w: number, h: number, orientation: number): string {
  const exif = Buffer.from([
    ...Buffer.from("Exif\0\0MM\0\x2a\0\0\0\x08", "latin1"),
    0x00,
    0x01, // one IFD entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // next IFD
  ]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif]);
  const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0]);
  return url("image/jpeg", Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, Buffer.from([0xff, 0xd9])]));
}

function webp(chunk: string, body: number[]): string {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.write("WEBP", 8, "latin1");
  b.write(chunk, 12, "latin1");
  Buffer.from(body).copy(b, 20);
  return url("image/webp", b);
}

describe("rasterSize", () => {
  test.each<[string, string, { w: number; h: number } | undefined]>([
    ["PNG IHDR", png(30, 20), { w: 30, h: 20 }],
    ["GIF, percent-encoded", "data:image/gif,GIF89a%1E%00%14%00", { w: 30, h: 20 }],
    ["JPEG SOF0", jpeg(30, 20, 1), { w: 30, h: 20 }],
    ["JPEG rotated by Exif orientation 6", jpeg(30, 20, 6), { w: 20, h: 30 }],
    ["WebP VP8", webp("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 30, 0, 20, 0]), { w: 30, h: 20 }],
    ["WebP VP8L", webp("VP8L", [0x2f, 29, 0xc0, 4, 0]), { w: 30, h: 20 }],
    ["WebP VP8X", webp("VP8X", [0, 0, 0, 0, 29, 0, 0, 19, 0, 0]), { w: 30, h: 20 }],
    ["truncated PNG", url("image/png", Buffer.from("\x89PNG\r\n\x1a\n", "latin1")), undefined],
    ["SVG", "data:image/svg+xml,%3Csvg%20width='30'%20height='20'/%3E", undefined],
    ["remote", "https://example.com/a.png", undefined],
  ])("%s", (_, src, want) => expect(rasterSize(src)).toEqual(want));
});

describe("imagePaint with an embedded raster", () => {
  const paint = (position: string, repeat: string) =>
    imagePaint(
      png(30, 20),
      { "background-size": "auto", "background-position": position, "background-repeat": repeat },
      "background",
      0,
      200,
      100,
      [],
    );

  test("`auto` resolves to the natural size, so a far-edge position is exact", () => {
    expect(paint("100% 100%", "no-repeat")).toMatchObject({ size: { w: 30, h: 20 }, position: [170, 80] });
  });

  test("a repeating layer gets its tile size and phase", () => {
    expect(paint("10px 5px", "repeat-x")).toMatchObject({
      size: { w: 30, h: 20 },
      position: [10, 5],
      repeat: "repeat-x",
    });
  });
});

describe("raster background emission", () => {
  const swift = (styles: Record<string, string>) => {
    const box = { x: 0, y: 0, w: 200, h: 100 };
    const doc: LayoutDoc = {
      version: LAYOUT_DOC_VERSION,
      source: "test",
      combo: { screen: "s", theme: "light" },
      size: { w: 200, h: 100 },
      viewport: { x: 0, y: 0, w: 200, h: 100 },
      conditions: [],
      dpr: 3,
      canvas: "rgb(255, 255, 255)",
      fonts: [],
      root: {
        tag: "main",
        attrs: {},
        styles: { display: "block" },
        bounds: box,
        children: [
          {
            tag: "div",
            attrs: {},
            styles: {
              display: "block",
              "background-image": `url("${png(30, 20)}")`,
              "background-size": "auto",
              ...styles,
            },
            bounds: box,
            children: [],
          },
        ],
      },
    };
    return compileLayout(doc, { name: "F", mode: "fidelity" }).code;
  };

  test("a repeat tiles at the natural size from its position, not `.tile`", () => {
    const code = swift({ "background-position": "10px 5px", "background-repeat": "repeat" });
    expect(code).toContain("MarkswiftTile(tile: CGSize(width: 30.0, height: 20.0), origin: CGPoint(x: 10.0, y: 5.0))");
    expect(code).not.toContain("resizingMode: .tile");
  });

  test("a no-repeat layer is drawn at its natural size at the far edge", () => {
    const code = swift({ "background-position": "100% 100%", "background-repeat": "no-repeat" });
    expect(code).toMatch(
      /\.resizable\(\)\.frame\(width: 30\.0, height: 20\.0\)\s*\n\s*\.offset\(x: 170\.0, y: 80\.0\)/,
    );
  });
});
