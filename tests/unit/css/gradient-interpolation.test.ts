import { expect, test } from "bun:test";
import { parseGradient, paintWithin, resolvePaint } from "../../../src/css/paint.ts";
import { gradientInterpolation } from "../../../src/css/gradient-interpolation.ts";
import { backgroundFills } from "../../../src/analysis/style-background.ts";

const legacy = "rgb(0, 0, 0), rgb(255, 255, 255)";
const modern = "oklab(0 0 0), oklab(1 0 0)";

test.each([
  ["linear", "90deg"], ["radial", "circle"], ["conic", "from 45deg"],
] as const)("%s retains effective interpolation when identical endpoints use different color syntax", (kind, direction) => {
  const a = parseGradient(`${kind}-gradient(${direction}, ${legacy})`);
  const b = parseGradient(`${kind}-gradient(${direction}, ${modern})`);
  expect(a.kind).toBe(kind); expect(b.kind).toBe(kind);
  expect(a).not.toHaveProperty("interpolation");
  expect(b).toHaveProperty("interpolation", "oklab");
  if (a.kind === "unsupported" || b.kind === "unsupported" || a.kind === "solid" || b.kind === "solid" || a.kind === "image" || b.kind === "image") throw new Error("Expected gradient paints");
  expect(a.stops[0]!.color).toEqual(b.stops[0]!.color);
  // Reprojection and stop normalization must not discard the interpolation contract.
  expect(paintWithin(resolvePaint(b, 240, 80), { x: 0, y: 0, w: 240, h: 80 }, { x: 20, y: 5, w: 120, h: 30 })).toHaveProperty("interpolation", "oklab");
  expect(parseGradient(`${kind}-gradient(${direction} in srgb, ${modern})`)).not.toHaveProperty("interpolation");
  expect(parseGradient(`${kind}-gradient(${direction} in oklab, ${legacy})`)).toHaveProperty("interpolation", "oklab");
});

test("explicit space without a direction and mixed modern/legacy stops retain their class", () => {
  expect(parseGradient(`linear-gradient(in oklab, ${legacy})`)).toMatchObject({ kind: "linear", angle: 180, interpolation: "oklab" });
  expect(parseGradient("linear-gradient(90deg, rgb(0, 0, 0), color(srgb 1 1 1))")).toHaveProperty("interpolation", "oklab");
  expect(gradientInterpolation(["hwb(0 0% 100%)", "hwb(0 100% 0%)"])?.oklab).toBe(false);
});

test.each(["srgb-linear", "display-p3", "lab", "hsl shorter hue", "oklch longer hue"])("unsupported explicit %s interpolation is diagnosed rather than guessed", space => {
  for (const kind of ["linear", "radial", "conic"]) {
    const raw = `${kind}-gradient(in ${space}, ${legacy})`;
    expect(parseGradient(raw)).toEqual({ kind: "unsupported", raw });
    const notes: string[] = [];
    expect(backgroundFills({ "background-image": raw }, 240, 80, notes)).toEqual([]);
    expect(notes.join(" ")).toContain("unmapped: background-image");
  }
});

test("modern perceptual conversion reports its interpolation and gamut limitation", () => {
  const notes: string[] = [];
  backgroundFills({ "background-image": `linear-gradient(90deg, ${modern})` }, 240, 80, notes);
  expect(notes.join(" ")).toContain("CSS Oklab gradient uses SwiftUI perceptual interpolation");
  expect(notes.join(" ")).toContain("wide-gamut");
});
