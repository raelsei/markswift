export interface PixelImage { data: Uint8Array; width: number; height: number }
export interface PixelRect { left: number; top: number; width: number; height: number }
export interface SpatialMetrics {
  meanRgbError: number;
  changedFraction: number;
  localSsim: number;
  activeSsim: number;
  edgePrecision: number;
  edgeRecall: number;
  referenceEdges: number;
  actualEdges: number;
  worstWindowRgbError: number;
  worstWindowChangedFraction: number;
  worstWindowSsim: number;
}

/** Uniform 8×8 local SSIM, not the Gaussian-window implementation from the paper.
 * Formula: Wang et al., https://eceweb.uwaterloo.ca/~z70wang/publications/ssim.html.
 * Active windows and spatial edge matching prevent blank areas from hiding missing content.
 */
export function spatialMetrics(reference: PixelImage, actual: PixelImage, tolerance = 0): SpatialMetrics {
  validate(reference); validate(actual);
  if (reference.width !== actual.width || reference.height !== actual.height) throw new Error("Pixel dimensions differ");
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 8) throw new Error("Invalid edge matching tolerance");
  const count = reference.width * reference.height;
  const first = new Float64Array(count), second = new Float64Array(count);
  const referenceRgb = composite(reference.data), actualRgb = composite(actual.data);
  let error = 0, changed = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const dr = Math.abs(referenceRgb[p]! - actualRgb[p]!);
    const dg = Math.abs(referenceRgb[p + 1]! - actualRgb[p + 1]!);
    const db = Math.abs(referenceRgb[p + 2]! - actualRgb[p + 2]!);
    error += dr + dg + db;
    if (dr > 16 || dg > 16 || db > 16) changed++;
    first[i] = referenceRgb[p]! * 0.299 + referenceRgb[p + 1]! * 0.587 + referenceRgb[p + 2]! * 0.114;
    second[i] = actualRgb[p]! * 0.299 + actualRgb[p + 1]! * 0.587 + actualRgb[p + 2]! * 0.114;
  }
  const expected = edges(referenceRgb, reference.width, reference.height), rendered = edges(actualRgb, actual.width, actual.height);
  const expectedCount = sum(expected), renderedCount = sum(rendered);
  const scores: number[] = [], active: number[] = [];
  let worstWindowRgbError = 0, worstWindowChangedFraction = 0, worstWindowSsim = 1;
  for (let y = 0; y < reference.height; y += 8) for (let x = 0; x < reference.width; x += 8) {
    let n = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0, ink = false, windowError = 0, windowChanged = 0;
    for (let dy = 0; dy < Math.min(8, reference.height - y); dy++) for (let dx = 0; dx < Math.min(8, reference.width - x); dx++) {
      const i = (y + dy) * reference.width + x + dx, a = first[i]!, b = second[i]!;
      n++; sx += a; sy += b; xx += a * a; yy += b * b; xy += a * b;
      ink ||= !!expected[i] || !!rendered[i];
      const p = i * 3, dr = Math.abs(referenceRgb[p]! - actualRgb[p]!), dg = Math.abs(referenceRgb[p + 1]! - actualRgb[p + 1]!), db = Math.abs(referenceRgb[p + 2]! - actualRgb[p + 2]!);
      windowError += dr + dg + db;
      if (dr > 16 || dg > 16 || db > 16) windowChanged++;
    }
    const mx = sx / n, my = sy / n;
    const vx = Math.max(0, xx / n - mx * mx), vy = Math.max(0, yy / n - my * my), cov = xy / n - mx * my;
    const c1 = 6.5025, c2 = 58.5225;
    const score = (2 * mx * my + c1) * (2 * cov + c2) / ((mx * mx + my * my + c1) * (vx + vy + c2));
    scores.push(score); if (ink) active.push(score);
    worstWindowRgbError = Math.max(worstWindowRgbError, windowError / (n * 3));
    worstWindowChangedFraction = Math.max(worstWindowChangedFraction, windowChanged / n);
    worstWindowSsim = Math.min(worstWindowSsim, score);
  }
  return {
    meanRgbError: error / (count * 3), changedFraction: changed / count,
    localSsim: average(scores), activeSsim: active.length ? average(active) : average(scores),
    edgePrecision: matched(rendered, expected, reference.width, reference.height, tolerance) / Math.max(1, renderedCount),
    edgeRecall: matched(expected, rendered, reference.width, reference.height, tolerance) / Math.max(1, expectedCount),
    referenceEdges: expectedCount, actualEdges: renderedCount,
    worstWindowRgbError, worstWindowChangedFraction, worstWindowSsim,
  };
}

function validate(image: PixelImage): void {
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0
    || image.data.length !== image.width * image.height * 4) throw new Error("Expected complete nonempty RGBA8 image");
}
/** Composite alpha over white consistently before comparing; transparent RGB is not evidence. */
function composite(data: Uint8Array): Float32Array {
  const out = new Float32Array(data.length / 4 * 3);
  for (let i = 0; i < data.length / 4; i++) {
    const alpha = data[i * 4 + 3]! / 255;
    for (let channel = 0; channel < 3; channel++) out[i * 3 + channel] = data[i * 4 + channel]! * alpha + 255 * (1 - alpha);
  }
  return out;
}
function edges(data: Float32Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    for (const neighbor of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1]) {
      if (neighbor < 0) continue;
      if (Math.abs(data[i * 3]! - data[neighbor * 3]!) >= 24
        || Math.abs(data[i * 3 + 1]! - data[neighbor * 3 + 1]!) >= 24
        || Math.abs(data[i * 3 + 2]! - data[neighbor * 3 + 2]!) >= 24) { result[i] = 1; break; }
    }
  }
  return result;
}
/** Eight-connected edge islands get individual gates: one missing glyph must not
 * be diluted by a long line. Reference and actual islands both matter. */
export function edgeComponents(image: PixelImage): PixelRect[] {
  validate(image);
  const mask = edges(composite(image.data), image.width, image.height);
  const queue = new Int32Array(mask.length), out: PixelRect[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0, tail = 1;
    queue[0] = start; mask[start] = 0;
    let left = start % image.width, right = left, top = Math.floor(start / image.width), bottom = top;
    while (head < tail) {
      const i = queue[head++]!, x = i % image.width, y = Math.floor(i / image.width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
        const next = ny * image.width + nx;
        if (mask[next]) { mask[next] = 0; queue[tail++] = next; }
      }
    }
    left = Math.max(0, left - 1); top = Math.max(0, top - 1);
    right = Math.min(image.width - 1, right + 1); bottom = Math.min(image.height - 1, bottom + 1);
    out.push({ left, top, width: right - left + 1, height: bottom - top + 1 });
  }
  return out;
}
function matched(source: Uint8Array, target: Uint8Array, width: number, height: number, tolerance: number): number {
  let total = 0;
  for (let i = 0; i < source.length; i++) {
    if (!source[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    let found = false;
    for (let dy = -tolerance; dy <= tolerance && !found; dy++) for (let dx = -tolerance; dx <= tolerance; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && target[ny * width + nx]) { found = true; break; }
    }
    if (found) total++;
  }
  return total;
}
const sum = (values: Uint8Array): number => values.reduce((total, value) => total + value, 0);
const average = (values: number[]): number => values.reduce((total, value) => total + value, 0) / values.length;
