import { expectClose } from "../../helpers/color.ts";
import { describe, expect, test } from "bun:test";
import { parseColor } from "../../../src/css/color.ts";


/** Chrome 152 canvas readback (sRGB, 8-bit) for each input; alpha rows use the computed rgba(). */
const CHROME_COLORS: Array<[string, [number, number, number, number]]> = [
  // Tailwind v4 palette (oklch) — blue-500, orange-500, slate-50, orange-600, gray-950
  ["oklch(0.623 0.214 259.815)", [43, 127, 255, 1]],
  ["oklch(0.646 0.222 41.116)", [245, 74, 0, 1]],
  ["oklch(0.985 0.002 247.839)", [249, 250, 251, 1]],
  ["oklch(0.705 0.213 47.604)", [255, 105, 0, 1]],
  ["oklch(0.13 0.028 261.692)", [3, 7, 18, 1]],
  ["oklch(62.3% 50% 260deg)", [53, 129, 253, 1]],
  ["oklch(0.7 0.1 none)", [210, 132, 156, 1]],
  ["oklch(none 0 0)", [0, 0, 0, 1]],
  ["oklab(0.5 0.1 -0.1)", [129, 69, 154, 1]],
  ["oklab(0.5 0.1 -0.1 / 0.5)", [129, 69, 154, 0.5]],
  ["lab(50 40 -20)", [171, 90, 154, 1]],
  ["lab(50% 20% -20%)", [145, 104, 162, 1]],
  ["lch(50 50 120)", [92, 130, 37, 1]],
  ["lch(50% 50% 0.5turn)", [0, 146, 117, 1]],
  ["hsl(210 40% 50%)", [77, 128, 179, 1]],
  ["hsl(210, 40%, 50%)", [77, 128, 179, 1]],
  ["hsla(210, 40%, 50%, 0.5)", [77, 128, 179, 0.5]],
  ["hsl(0.5turn 40% 50%)", [77, 179, 179, 1]],
  ["hwb(120 20% 30%)", [51, 179, 51, 1]],
  ["hwb(120deg 20% 30% / 50%)", [51, 179, 51, 0.5]],
  ["color(srgb 0.2 0.4 0.6 / 0.5)", [51, 102, 153, 0.5]],
  ["color(srgb-linear 0.2 0.4 0.6)", [124, 170, 203, 1]],
  ["color(display-p3 1 0 0)", [255, 0, 0, 1]],
  ["color(display-p3 0.5 0.6 0.7)", [121, 154, 181, 1]],
  ["color(a98-rgb 0.5 0.5 0.5)", [128, 128, 128, 1]],
  ["color(prophoto-rgb 0.5 0.5 0.5)", [146, 146, 146, 1]],
  ["color(rec2020 0.5 0.5 0.5)", [139, 139, 139, 1]],
  ["color(xyz 0.3 0.4 0.5)", [92, 184, 181, 1]],
  ["color(xyz-d65 0.3 0.4 0.5)", [92, 184, 181, 1]],
  ["color(xyz-d50 0.3 0.4 0.5)", [62, 186, 208, 1]],
  // Regression rows: forms already handled before this wave.
  ["rgb(59, 130, 246)", [59, 130, 246, 1]],
  ["rgba(59, 130, 246, 0.25)", [59, 130, 246, 0.25]],
  ["rgb(59 130 246 / 50%)", [59, 130, 246, 0.5]],
  ["#abc", [170, 187, 204, 1]],
  ["#abcd", [170, 187, 204, 221 / 255]],
  ["#aabbcc", [170, 187, 204, 1]],
  ["#aabbccdd", [170, 187, 204, 221 / 255]],
  ["transparent", [0, 0, 0, 0]],
];



describe("parseColor", () => {
  test.each(CHROME_COLORS)("%s", (input, want) => expectClose(parseColor(input), want));

  test("exact legacy values are untouched by rounding", () => {
    expect(parseColor("rgb(59, 130, 246)")).toEqual({ r: 59 / 255, g: 130 / 255, b: 246 / 255, a: 1 });
    expect(parseColor("color(srgb 0.2 0.4 0.6)")).toEqual({ r: 0.2, g: 0.4, b: 0.6, a: 1 });
  });

  test("wide-gamut components are clipped to sRGB", () => {
    expect(parseColor("color(display-p3 1 0 0)")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor("color(srgb 1.2 -0.1 0.5)")).toEqual({ r: 1, g: 0, b: 0.5, a: 1 });
  });

  test.each(["", "none", "currentcolor", "oklch(1 2)", "color(foo 0 0 0)", "hsl(1 2 3 4)", "#abcde", "rgb(1 2 3 / 0.5 / 1)", "lab(50 40 -20 0.5)"])(
    "rejects %s",
    (input) => expect(parseColor(input)).toBeUndefined(),
  );
});
