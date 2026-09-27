import { expect, test } from "bun:test";
import { spatialMetrics, type PixelImage } from "../../../tools/verify/pixel-metrics.ts";

function image(blocks: Array<[number, number, number, number]>, width = 100, height = 100): PixelImage {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (const [x, y, w, h] of blocks) for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const i = ((y + dy) * width + x + dx) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return { data, width, height };
}

test("identical content has perfect structure and spatial edges", () => {
  const reference = image([[5, 5, 10, 10]]);
  expect(spatialMetrics(reference, reference)).toMatchObject({ meanRgbError: 0, changedFraction: 0, localSsim: 1, activeSsim: 1, edgePrecision: 1, edgeRecall: 1 });
});

test("a tiny displaced feature fails spatial gates even when whole-image mean passes", () => {
  const score = spatialMetrics(image([[5, 5, 10, 10]]), image([[70, 70, 10, 10]]), 1);
  expect(score.meanRgbError).toBeCloseTo(5.1);
  expect(score.edgePrecision).toBe(0); expect(score.edgeRecall).toBe(0);
  expect(score.activeSsim).toBeLessThan(0.8);
});

test("deleted or extra content is penalized independently of sparse background", () => {
  const one = image([[5, 5, 10, 10]], 300, 300), two = image([[5, 5, 10, 10], [70, 70, 10, 10]], 300, 300);
  const missing = spatialMetrics(two, one, 1), extra = spatialMetrics(one, two, 1);
  expect(missing.meanRgbError).toBeLessThan(1);
  expect(missing.edgeRecall).toBeLessThan(0.6); expect(extra.edgePrecision).toBeLessThan(0.6);
  expect(missing.activeSsim).toBeLessThan(0.8); expect(extra.activeSsim).toBeLessThan(0.8);
});

test("matching tolerance is bounded and never covers large displacements", () => {
  const reference = image([[5, 5, 10, 10]]);
  expect(spatialMetrics(reference, image([[6, 5, 10, 10]]), 1).edgeRecall).toBe(1);
  expect(spatialMetrics(reference, image([[9, 5, 10, 10]]), 1).edgeRecall).toBeLessThan(0.8);
  expect(() => spatialMetrics(reference, reference, 9)).toThrow();
});

test("dimensions and alpha cannot silently hide invalid evidence", () => {
  expect(() => spatialMetrics(image([], 10, 10), image([], 20, 20))).toThrow("dimensions");
  expect(() => spatialMetrics({ data: new Uint8Array(4), width: 10, height: 10 }, image([], 10, 10))).toThrow("RGBA8");
  const transparent = image([], 10, 10); transparent.data.fill(0);
  expect(spatialMetrics(transparent, image([], 10, 10)).meanRgbError).toBe(0);
});

test("one glyph cannot hide in a connected decorated line or in same-luminance color", () => {
  const reference = image(Array.from({ length: 120 }, (_, i) => [i * 4, 3, 1, 7] as [number, number, number, number]), 512, 16);
  for (let x = 0; x < 480; x++) {
    const p = (10 * 512 + x) * 4; reference.data[p] = reference.data[p + 1] = reference.data[p + 2] = 0;
  }
  const missing = { ...reference, data: reference.data.slice() };
  const colored = { ...reference, data: reference.data.slice() };
  for (let y = 3; y < 10; y++) {
    const p = (y * 512 + 240) * 4;
    reference.data[p] = 255; reference.data[p + 1] = reference.data[p + 2] = 0;
    missing.data[p] = missing.data[p + 1] = missing.data[p + 2] = 255;
    colored.data[p] = colored.data[p + 2] = 0; colored.data[p + 1] = 130;
  }
  const deletion = spatialMetrics(reference, missing, 1), replacement = spatialMetrics(reference, colored, 1);
  expect(deletion.localSsim).toBeGreaterThan(0.99);
  expect(deletion.worstWindowSsim).toBeLessThan(0.99);
  expect(replacement.localSsim).toBeGreaterThan(0.99);
  expect(replacement.worstWindowRgbError).toBeGreaterThan(4);
});
