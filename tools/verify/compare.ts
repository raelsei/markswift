/**
 * Reference (browser) vs iOS render: pixelmatch at device scale for the diff
 * image and mismatch ratio; SSIM at 1× (perceptual, and JS SSIM on 3 MP images
 * is slow). Images of different sizes are a failure, never stretched to fit.
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
  /** Mean SSIM at 1× (0…1). */
  ssim: number;
  ms: number;
}

export async function compare(refPath: string, testPath: string, diffPath: string): Promise<CompareResult> {
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
  const bad = pixelmatch(a, b, diff.data, width, height, { threshold: 0.1, includeAA: false });
  await sharp(PNG.sync.write(diff)).png().toFile(diffPath);

  const w1 = Math.round(width / 3);
  const h1 = Math.round(height / 3);
  const [ga, gb] = await Promise.all([
    sharp(refPath).resize(w1, h1).greyscale().raw().toBuffer(),
    sharp(testPath).resize(w1, h1).greyscale().raw().toBuffer(),
  ]);
  const toImage = (buf: Buffer) => {
    const data = new Uint8ClampedArray(w1 * h1 * 4);
    for (let i = 0; i < w1 * h1; i++) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = buf[i]!;
      data[i * 4 + 3] = 255;
    }
    return { data, width: w1, height: h1 };
  };
  const { mssim } = ssim(toImage(ga), toImage(gb));
  return { width, height, mismatch: bad / (width * height), ssim: mssim, ms: performance.now() - t0 };
}
