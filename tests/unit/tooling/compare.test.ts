import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { compare, placeholderPixels, regionMismatch } from "../../../tools/verify/compare.ts";

// 400×240 device px at DPR 2: white canvas, a #2563eb rect at (40,40,240,120), a #111827 bar at (40,180,320,20).
const W = 400,
  H = 240;
type Rgb = [number, number, number];
const BLUE: Rgb = [0x25, 0x63, 0xeb],
  INK: Rgb = [0x11, 0x18, 0x27];

async function png(path: string, rects: Array<[number, number, number, number, Rgb]>, swap = false, width = W) {
  const buf = Buffer.alloc(width * H * 3, 255);
  for (const [x, y, w, h, c] of rects) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) buf.set(swap ? [c[2], c[1], c[0]] : c, (j * width + i) * 3);
  }
  await sharp(buf, { raw: { width, height: H, channels: 3 } })
    .png()
    .toFile(path);
  return path;
}

let dir = "";
let ref = "";
const reference = (dy = 0): Array<[number, number, number, number, Rgb]> => [
  [40, 40 + dy, 240, 120, BLUE],
  [40, 180, 320, 20, INK],
];
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "markswift-compare-"));
  ref = await png(join(dir, "ref.png"), reference());
});
afterAll(() => rm(dir, { recursive: true, force: true }));

test("identical images score perfect", async () => {
  const same = await png(join(dir, "same.png"), reference());
  const score = await compare(ref, same, join(dir, "d1.png"), 2);
  expect(score.ssim).toBeGreaterThan(0.999);
  expect(score.mismatch).toBe(0);
});

test("an R/B channel swap fails colour SSIM and mismatch (greyscale SSIM passed it at 0.977)", async () => {
  const swapped = await png(join(dir, "swap.png"), reference(), true);
  const score = await compare(ref, swapped, join(dir, "d2.png"), 2);
  expect(score.ssim).toBeLessThan(0.95);
  expect(score.mismatch).toBeGreaterThan(0.2);
});

test("a blank render fails the element region", async () => {
  const blank = await png(join(dir, "blank.png"), []);
  expect(await regionMismatch(ref, blank, { x: 20, y: 20, w: 120, h: 60 }, 2)).toBeGreaterThan(0.5);
});

test("a shifted element fails its region while untouched areas stay clean", async () => {
  const shifted = await png(join(dir, "shift.png"), reference(32));
  expect(await regionMismatch(ref, shifted, { x: 20, y: 20, w: 120, h: 60 }, 2)).toBeGreaterThan(0.1);
  expect(await regionMismatch(ref, shifted, { x: 160, y: 0, w: 40, h: 20 }, 2)).toBe(0);
});

test("different dimensions are rejected, never stretched", async () => {
  const narrow = await png(join(dir, "narrow.png"), [], false, 398);
  await expect(compare(ref, narrow, join(dir, "d3.png"), 2)).rejects.toThrow("image dimensions differ");
});

test("a 16-bit Display P3 render of the same colour scores as identical", async () => {
  const buf = Buffer.alloc(40 * 40 * 3);
  for (let i = 0; i < buf.length; i += 3) buf.set([14, 165, 234], i);
  const raw = { raw: { width: 40, height: 40, channels: 3 as const } };
  const plain = join(dir, "srgb.png");
  const p3 = join(dir, "p3.png");
  await sharp(buf, raw).png().toFile(plain);
  await sharp(buf, raw).toColourspace("rgb16").withIccProfile("p3").png().toFile(p3);
  const score = await compare(plain, p3, join(dir, "d4.png"), 2);
  expect(score.mismatch).toBe(0);
  expect(score.ssim).toBeGreaterThanOrEqual(0.999);
});

test("placeholderPixels counts only the exact ImageRenderer yellow", async () => {
  const buf = Buffer.alloc(20 * 20 * 3, 255);
  for (let y = 2; y < 8; y++) for (let x = 3; x < 8; x++) buf.set([255, 204, 0], (y * 20 + x) * 3);
  buf.set([255, 205, 0], (15 * 20 + 15) * 3);
  const yellow = join(dir, "yellow.png");
  await sharp(buf, { raw: { width: 20, height: 20, channels: 3 } })
    .png()
    .toFile(yellow);
  expect(await placeholderPixels(yellow)).toBe(30);
  expect(await placeholderPixels(ref)).toBe(0);
});
