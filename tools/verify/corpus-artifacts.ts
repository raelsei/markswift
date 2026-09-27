import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { AppearanceEvidence } from "./corpus-metrics.ts";
import { digest } from "./corpus-evidence.ts";

export interface AppearanceSummary {
  whole: AppearanceEvidence["whole"];
  failures: string[];
  regionCount: number;
  failedRegionCount: number;
  details: string;
}

/** Keep complete local measurements in a hashed per-comparison file instead of
 * duplicating thousands of glyph records in every whole-run checkpoint. */
export async function saveAppearanceArtifacts(appearance: AppearanceEvidence, reference: string, native: string,
  prefix: string): Promise<{ appearance: AppearanceSummary; artifactHashes: Record<string, string> }> {
  const details = `${prefix}-appearance.json`, diff = `${prefix}-diff.png`;
  await writeFile(details, JSON.stringify(appearance, null, 2) + "\n", { flag: "wx" });
  const load = (path: string) => sharp(path).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [first, second] = await Promise.all([load(reference), load(native)]);
  if (first.info.width !== second.info.width || first.info.height !== second.info.height) throw new Error("Diff images have different dimensions");
  const data = Buffer.alloc(first.data.length);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) data[i + c] = Math.abs(first.data[i + c]! - second.data[i + c]!);
    data[i + 3] = 255;
  }
  await sharp(data, { raw: { width: first.info.width, height: first.info.height, channels: 4 } }).png().toFile(diff);
  return {
    appearance: { whole: appearance.whole, failures: appearance.failures, regionCount: appearance.regions.length,
      failedRegionCount: appearance.regions.filter(region => region.failures.length).length, details },
    artifactHashes: Object.fromEntries(await Promise.all([details, diff].map(async path => [path, digest(await readFile(path))]))),
  };
}
