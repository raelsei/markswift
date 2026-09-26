import sharp from "sharp";

export type Rgb = readonly [number, number, number];

export interface RegionComparison {
  meanRgbError: number;
  /** Foreground pixel count relative to the reference; may exceed 1 for thicker glyphs. */
  foregroundRetention: number;
}

/** Compare exact-size screenshots. Dimensions are CSS points; dpr converts them to pixels. */
export async function meanRgbError(reference: string, actual: string, width: number, height: number, dpr: number): Promise<number> {
  const expected = pixelDimensions(width, height, dpr);
  const images = await Promise.all([reference, actual].map(path =>
    sharp(path).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ));
  for (const [index, image] of images.entries()) {
    if (image.info.width !== expected.width || image.info.height !== expected.height) {
      throw new Error(`${index === 0 ? "Reference" : "Actual"}: expected ${expected.width}×${expected.height} px, got ${image.info.width}×${image.info.height}`);
    }
  }
  return bufferRgbError(images[0]!.data, images[1]!.data);
}

/**
 * Compare an RGBA region and retain contrasting foreground in either light or dark themes.
 * Buffers must be nonempty, equally sized RGBA8 pixels over the supplied flat background.
 * A reference without foreground cannot prove that the expected text is present.
 */
export function regionComparison(referenceRGBA: Uint8Array, actualRGBA: Uint8Array, backgroundRGB: Rgb): RegionComparison {
  validateBuffers(referenceRGBA, actualRGBA);
  if (backgroundRGB.length !== 3 || backgroundRGB.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    throw new Error("Background must contain three RGB8 channels");
  }
  let referenceForeground = 0, actualForeground = 0;
  for (let offset = 0; offset < referenceRGBA.length; offset += 4) {
    if (isForeground(referenceRGBA, offset, backgroundRGB)) referenceForeground++;
    if (isForeground(actualRGBA, offset, backgroundRGB)) actualForeground++;
  }
  if (referenceForeground === 0) throw new Error("Reference region has no contrasting foreground");
  return {
    meanRgbError: bufferRgbError(referenceRGBA, actualRGBA),
    foregroundRetention: actualForeground / referenceForeground,
  };
}

function pixelDimensions(width: number, height: number, dpr: number): { width: number; height: number } {
  if (![width, height, dpr].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("Width, height and dpr must be positive finite numbers");
  }
  const pixels = { width: width * dpr, height: height * dpr };
  if (![pixels.width, pixels.height].every(Number.isSafeInteger)) {
    throw new Error("Width and height multiplied by dpr must be safe whole pixel counts");
  }
  return pixels;
}

function validateBuffers(reference: Uint8Array, actual: Uint8Array): void {
  if (!reference.length || !actual.length) throw new Error("RGBA buffers must not be empty");
  if (reference.length !== actual.length) throw new Error("RGBA buffers must have matching lengths");
  if (reference.length % 4 !== 0) throw new Error("RGBA buffers must contain complete four-channel pixels");
}

function bufferRgbError(reference: Uint8Array, actual: Uint8Array): number {
  validateBuffers(reference, actual);
  let total = 0;
  for (let offset = 0; offset < reference.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) total += Math.abs(reference[offset + channel]! - actual[offset + channel]!);
  }
  return total / (reference.length / 4 * 3);
}

function isForeground(pixels: Uint8Array, offset: number, background: Rgb): boolean {
  return background.some((channel, index) => Math.abs(pixels[offset + index]! - channel) >= 64);
}
