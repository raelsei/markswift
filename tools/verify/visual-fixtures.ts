import sharp from "sharp";

export type Theme = "light" | "dark";
export type Rgb = [number, number, number];
export interface VisualRegion {
  id?: string;
  tag?: string;
  label: string;
  maxError?: number;
  minForeground?: number;
  /** Inset text checks past widget borders, using their own flat field background. */
  inset?: number;
  background?: Record<Theme, Rgb>;
}

export interface VisualFixture {
  id: string;
  height: number;
  name: string;
  responsive: boolean;
  /** UIHostingController is required for live controls and scrollable selection rows. */
  hosted?: boolean;
  background: Record<Theme, Rgb>;
  samples?: Array<{ x: number; y: number; rgb: Rgb | Record<Theme, Rgb> }>;
  regions?: VisualRegion[];
}

export const visualFixtures: VisualFixture[] = [
  { id: "allocation", height: 460, name: "VisualSmokeAllocation", responsive: false,
    background: { light: [246, 248, 251], dark: [22, 30, 43] },
    regions: [{ id: "grow-tracks", label: "unequal flex growth", maxError: 16 },
      { id: "shrink-tracks", label: "scaled flex shrink", maxError: 16 },
      { id: "fraction-grid", label: "fixed and fractional grid tracks", maxError: 16 }],
  },
  { id: "table-spans", height: 360, name: "VisualSmokeTableSpans", responsive: false,
    background: { light: [246, 248, 251], dark: [22, 30, 43] },
    regions: [{ id: "span-caption", label: "spanned table caption" },
      { id: "span-table", label: "unequal columns and merged cells", maxError: 16 }],
  },
  { id: "select-lists", height: 440, name: "VisualSmokeSelectionLists", responsive: false, hosted: true,
    background: { light: [255, 255, 255], dark: [23, 29, 39] },
    regions: [{ id: "single-list", label: "single list rows", maxError: 32 },
      { id: "multiple-list", label: "multiple selected rows", maxError: 32 }],
  },
  { id: "rich-text", height: 480, name: "VisualSmokeRichText", responsive: false,
    background: { light: [255, 255, 255], dark: [23, 29, 39] } },
  { id: "full-page", height: 650, name: "VisualSmokeFullPage", responsive: true,
    background: { light: [243, 239, 232], dark: [28, 27, 35] } },
  { id: "flex", height: 350, name: "VisualSmokeFlex", responsive: false,
    background: { light: [246, 248, 251], dark: [22, 30, 43] },
    regions: [{ id: "flex-tracks", label: "wrapped tracks", maxError: 16 }],
    samples: [{ x: 32, y: 174, rgb: { light: [219, 234, 254], dark: [36, 59, 89] } },
      { x: 240, y: 174, rgb: { light: [220, 252, 231], dark: [35, 66, 56] } }],
  },
  { id: "grid", height: 330, name: "VisualSmokeGrid", responsive: false,
    background: { light: [246, 248, 251], dark: [22, 30, 43] },
    regions: [{ id: "activity-grid", label: "grid tiles", maxError: 16 }],
    samples: [{ x: 32, y: 174, rgb: { light: [219, 234, 254], dark: [36, 59, 89] } },
      { x: 240, y: 174, rgb: { light: [220, 252, 231], dark: [35, 66, 56] } },
      { x: 32, y: 284, rgb: { light: [254, 243, 199], dark: [76, 58, 36] } },
      { x: 240, y: 284, rgb: { light: [252, 231, 243], dark: [73, 44, 66] } }],
  },
  { id: "table", height: 320, name: "VisualSmokeTable", responsive: false,
    background: { light: [246, 248, 251], dark: [22, 30, 43] },
    regions: [{ id: "release-caption", label: "table caption" }, { id: "release-table", label: "table cells", maxError: 16 }],
    samples: [{ x: 30, y: 120, rgb: { light: [226, 232, 240], dark: [44, 57, 76] } },
      { x: 30, y: 168, rgb: { light: [219, 234, 254], dark: [36, 59, 89] } },
      { x: 140, y: 168, rgb: { light: [254, 243, 199], dark: [76, 58, 36] } },
      { x: 285, y: 168, rgb: { light: [220, 252, 231], dark: [35, 66, 56] } }],
  },
  { id: "form", height: 640, name: "VisualSmokeForm", responsive: false,
    background: { light: [255, 255, 255], dark: [23, 29, 39] },
    regions: [
      { id: "workspace", label: "text field value", inset: 4, background: { light: [244, 246, 250], dark: [41, 52, 68] } },
      { id: "token", label: "password field value", inset: 4, background: { light: [244, 246, 250], dark: [41, 52, 68] } },
      { id: "region", label: "selected option", inset: 4, background: { light: [244, 246, 250], dark: [41, 52, 68] } },
      { id: "notes", label: "readonly text", inset: 4, background: { light: [244, 246, 250], dark: [41, 52, 68] } },
    ],
  },
  { id: "effects", height: 610, name: "VisualSmokeEffects", responsive: false,
    background: { light: [255, 255, 255], dark: [28, 27, 35] },
    regions: [
      { id: "linear-paint", label: "linear gradient", maxError: 16 },
      { id: "radial-paint", label: "radial gradient", maxError: 16 },
      { id: "shadow-paint", label: "border and inset shadow", maxError: 16 },
      { id: "pseudo-paint", label: "clipped pseudo decoration", maxError: 16 },
      { tag: "svg", label: "SVG paint", maxError: 16 },
    ],
  },
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
