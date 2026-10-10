/**
 * Reference (browser) vs native render: pixelmatch at device scale for the diff
 * image and mismatch ratio; colour SSIM = min per-channel SSIM at 1× CSS px
 * (a channel swap or recolour scores low, unlike greyscale SSIM). Images of
 * different sizes are a failure, never stretched to fit.
 */
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import ssim from "ssim.js";

export interface CompareResult {
  width: number;
  height: number;
  /** Fraction of differing pixels at device scale (pixelmatch threshold 0.1). */
  mismatch: number;
  /** Minimum per-channel (R, G, B) mean SSIM at 1× CSS px (0…1). */
  ssim: number;
  ms: number;
}

const MATCH = { threshold: 0.1, includeAA: false };

export async function compare(refPath: string, testPath: string, diffPath: string, dpr: number): Promise<CompareResult> {
  const t0 = performance.now();
  const ref = sharp(refPath);
  const [meta, testMeta] = await Promise.all([ref.metadata(), sharp(testPath).metadata()]);
  const width = meta.width!;
  const height = meta.height!;
  if (testMeta.width !== width || testMeta.height !== height) throw new Error(`image dimensions differ: ${width}x${height} vs ${testMeta.width}x${testMeta.height}`);
  const [a, b] = await Promise.all([
    ref.ensureAlpha().raw().toBuffer(),
    sharp(testPath).ensureAlpha().raw().toBuffer(),
  ]);
  const diff = new PNG({ width, height });
  const bad = pixelmatch(a, b, diff.data, width, height, MATCH);
  await sharp(PNG.sync.write(diff)).png().toFile(diffPath);

  const w1 = Math.round(width / dpr);
  const h1 = Math.round(height / dpr);
  const [ca, cb] = await Promise.all([
    sharp(refPath).resize(w1, h1).removeAlpha().raw().toBuffer(),
    sharp(testPath).resize(w1, h1).removeAlpha().raw().toBuffer(),
  ]);
  const channel = (buf: Buffer, c: number) => {
    const data = new Uint8ClampedArray(w1 * h1 * 4);
    for (let i = 0; i < w1 * h1; i++) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = buf[i * 3 + c]!;
      data[i * 4 + 3] = 255;
    }
    return { data, width: w1, height: h1 };
  };
  const scores = [0, 1, 2].map(c => ssim(channel(ca, c), channel(cb, c)).mssim);
  return { width, height, mismatch: bad / (width * height), ssim: Math.min(...scores), ms: performance.now() - t0 };
}

/** Pixelmatch mismatch inside one element's box (CSS px, scaled by `dpr`, clamped to the image). */
export async function regionMismatch(refPath: string, testPath: string, rect: { x: number; y: number; w: number; h: number }, dpr: number): Promise<number> {
  const meta = await sharp(refPath).metadata();
  const left = Math.max(0, Math.round(rect.x * dpr));
  const top = Math.max(0, Math.round(rect.y * dpr));
  const width = Math.min(meta.width!, Math.round((rect.x + rect.w) * dpr)) - left;
  const height = Math.min(meta.height!, Math.round((rect.y + rect.h) * dpr)) - top;
  if (width <= 0 || height <= 0) throw new Error(`region ${JSON.stringify(rect)} lies outside the ${meta.width}x${meta.height} image`);
  const crop = (path: string) => sharp(path).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer();
  const [a, b] = await Promise.all([crop(refPath), crop(testPath)]);
  return pixelmatch(a, b, undefined, width, height, MATCH) / (width * height);
}
