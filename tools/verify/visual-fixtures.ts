import sharp from "sharp";

export type Theme = "light" | "dark";
export type Rgb = [number, number, number];

export interface VisualFixture {
  id: string;
  height: number;
  name: string;
  responsive: boolean;
  background: Record<Theme, Rgb>;
  samples?: Array<{ x: number; y: number; rgb: Rgb }>;
}

export const visualFixtures: VisualFixture[] = [
  { id: "rich-text", height: 480, name: "VisualSmokeRichText", responsive: false,
    background: { light: [255, 255, 255], dark: [23, 29, 39] } },
  { id: "full-page", height: 650, name: "VisualSmokeFullPage", responsive: true,
    background: { light: [243, 239, 232], dark: [28, 27, 35] } },
  { id: "image-position", height: 255, name: "VisualSmokeImagePosition", responsive: false,
    background: { light: [255, 255, 255], dark: [24, 24, 32] }, samples: [
      { x: 42, y: 42, rgb: [255, 0, 0] },
      { x: 127, y: 42, rgb: [0, 0, 255] },
      { x: 42, y: 127, rgb: [0, 255, 0] },
      { x: 127, y: 127, rgb: [255, 255, 0] },
      { x: 42, y: 212, rgb: [255, 0, 0] },
      { x: 127, y: 212, rgb: [0, 0, 255] },
    ] },
];

async function stripedImage(width: number, height: number, vertical: boolean, near: Rgb, far: Rgb, format: "png" | "jpeg" = "png"): Promise<string> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = (vertical ? y < height / 2 : x < width / 2) ? near : far;
    const offset = (y * width + x) * 3;
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = color[channel]!;
  }
  const source = sharp(pixels, { raw: { width, height, channels: 3 } });
  const bytes = await (format === "jpeg" ? source.jpeg({ quality: 100 }).withMetadata({ orientation: 6 }) : source.png()).toBuffer();
  return `data:image/${format};base64,${bytes.toString("base64")}`;
}

export async function loadVisualFixture(fixture: VisualFixture): Promise<{ html: string; css: string }> {
  let html = await Bun.file(new URL(`./fixtures/${fixture.id}.html`, import.meta.url)).text();
  const css = await Bun.file(new URL(`./fixtures/${fixture.id}.css`, import.meta.url)).text();
  if (fixture.id === "image-position") {
    const horizontal = await stripedImage(80, 40, false, [255, 0, 0], [0, 0, 255]);
    const vertical = await stripedImage(40, 80, true, [0, 255, 0], [255, 255, 0]);
    const exif = await stripedImage(80, 40, false, [255, 0, 0], [0, 0, 255], "jpeg");
    html = html.replaceAll("__MARKSWIFT_HORIZONTAL_URL__", horizontal)
      .replaceAll("__MARKSWIFT_VERTICAL_URL__", vertical).replaceAll("__MARKSWIFT_EXIF_URL__", exif);
  }
  return { html, css };
}
