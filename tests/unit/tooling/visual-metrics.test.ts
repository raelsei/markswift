import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { meanRgbError, regionComparison, type Rgb } from "../../../tools/verify/visual-metrics.ts";

function rgba(colors: readonly Rgb[]): Buffer {
  return Buffer.from(colors.flatMap(color => [...color, 255]));
}

test("same foreground has zero RGB error and complete retention in light and dark themes", () => {
  for (const [background, foreground] of [
    [[243, 239, 232], [32, 32, 42]],
    [[24, 24, 32], [240, 240, 245]],
  ] as const) {
    const image = rgba([background, foreground, foreground, background]);
    expect(regionComparison(image, image, background)).toEqual({ meanRgbError: 0, foregroundRetention: 1 });
    const erased = regionComparison(image, rgba([background, background, background, background]), background);
    expect(erased.foregroundRetention).toBe(0);
    expect(erased.meanRgbError).toBeGreaterThan(32);
  }
});

test("changed and partially missing foreground remain measurable", () => {
  const background: Rgb = [255, 255, 255];
  const reference = rgba([background, [0, 0, 0], [0, 0, 0], background]);
  const partial = regionComparison(reference, rgba([background, [0, 0, 0], background, background]), background);
  expect(partial.foregroundRetention).toBe(0.5);
  expect(partial.meanRgbError).toBe(63.75);
  const recolored = regionComparison(reference, rgba([background, [255, 0, 0], [255, 0, 0], background]), background);
  expect(recolored.foregroundRetention).toBe(1);
  expect(recolored.meanRgbError).toBe(42.5);
});

test("region comparison rejects invalid or unmeasurable input", () => {
  const pixel = rgba([[0, 0, 0]]);
  expect(() => regionComparison(Buffer.alloc(0), Buffer.alloc(0), [255, 255, 255])).toThrow("empty");
  expect(() => regionComparison(pixel, Buffer.alloc(8), [255, 255, 255])).toThrow("matching lengths");
  expect(() => regionComparison(Buffer.alloc(3), Buffer.alloc(3), [255, 255, 255])).toThrow("four-channel");
  expect(() => regionComparison(pixel, pixel, [256, 0, 0])).toThrow("RGB8");
  expect(() => regionComparison(pixel, pixel, [0, 0, 0])).toThrow("no contrasting foreground");
});

test("exact-size PNG comparison measures RGB changes and rejects dimension mismatches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-visual-metrics-"));
  try {
    const reference = join(directory, "reference.png"), actual = join(directory, "actual.png");
    const input = rgba([[0, 0, 0], [255, 255, 255], [255, 255, 255], [0, 0, 0]]);
    await sharp(input, { raw: { width: 2, height: 2, channels: 4 } }).png().toFile(reference);
    await sharp(input, { raw: { width: 2, height: 2, channels: 4 } }).png().toFile(actual);
    expect(await meanRgbError(reference, actual, 1, 1, 2)).toBe(0);
    await sharp(rgba([[255, 255, 255], [255, 255, 255], [255, 255, 255], [0, 0, 0]]), { raw: { width: 2, height: 2, channels: 4 } }).png().toFile(actual);
    expect(await meanRgbError(reference, actual, 1, 1, 2)).toBe(63.75);
    await sharp({ create: { width: 1, height: 2, channels: 4, background: "white" } }).png().toFile(actual);
    await expect(meanRgbError(reference, actual, 1, 1, 2)).rejects.toThrow("Actual: expected 2×2 px, got 1×2");
    await expect(meanRgbError(reference, reference, 1, 2, 2)).rejects.toThrow("Reference: expected 2×4 px, got 2×2");
    await expect(meanRgbError(reference, reference, 0, 1, 2)).rejects.toThrow("positive finite");
    await expect(meanRgbError(reference, reference, 1, 1, 1.5)).rejects.toThrow("whole pixel");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a heading erased inside a large canvas fails retention even when whole-image RGB passes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-erased-heading-"));
  try {
    for (const [theme, background, foreground] of [
      ["light", [243, 239, 232], [32, 32, 42]],
      ["dark", [24, 24, 32], [240, 240, 245]],
    ] as const) {
      const reference = join(directory, `${theme}-reference.png`), actual = join(directory, `${theme}-actual.png`);
      const pixels = rgba(Array.from({ length: 100 }, (_, index) => index < 2 ? foreground : background));
      const blank = rgba(Array.from({ length: 100 }, () => background));
      await sharp(pixels, { raw: { width: 10, height: 10, channels: 4 } }).png().toFile(reference);
      await sharp(blank, { raw: { width: 10, height: 10, channels: 4 } }).png().toFile(actual);
      expect(await meanRgbError(reference, actual, 10, 10, 1)).toBeLessThan(8);
      const region = regionComparison(pixels.subarray(0, 16), blank.subarray(0, 16), background);
      expect(region.foregroundRetention).toBeLessThan(0.7);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
