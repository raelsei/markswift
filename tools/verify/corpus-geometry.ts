import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { GeometryManifest } from "../../src/swift/geometry-observation.ts";
import { compareGeometry, parseNativeGeometry, type ChromeGeometry, type GeometryComparison } from "./geometry.ts";
import { compareScrollRanges, type ScrollRangeComparison } from "./corpus-scroll.ts";

export interface CorpusGeometryEvidence {
  manifest: string;
  native: string;
  reference: string;
  report: string;
  tolerance: number;
  mode: "app" | "fidelity";
  passed: boolean;
  comparison: GeometryComparison;
  scroll: ScrollRangeComparison;
}

/** Compare actual native collector output against independently observed live DOM borders. */
export async function saveCorpusGeometry(manifest: GeometryManifest, native: string, reference: string,
  prefix: string, mode: "app" | "fidelity" = "app"): Promise<{ geometry: CorpusGeometryEvidence; artifactHashes: Record<string, string> }> {
  const tolerance = 0.5, actual = parseNativeGeometry(JSON.parse(await readFile(native, "utf8"))),
    expected = JSON.parse(await readFile(reference, "utf8")) as ChromeGeometry;
  const comparison = compareGeometry(manifest, actual, expected, tolerance);
  const scroll = compareScrollRanges(manifest, actual, expected, mode, tolerance);
  const manifestPath = `${prefix}-geometry-manifest.json`, report = `${prefix}-geometry-report.json`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  await writeFile(report, JSON.stringify({ comparison, scroll }, null, 2) + "\n", { flag: "wx" });
  const geometry: CorpusGeometryEvidence = { manifest: manifestPath, native, reference, report, tolerance, mode,
    passed: comparison.complete && comparison.matchingFrames && scroll.passed, comparison, scroll };
  const artifactHashes = Object.fromEntries(await Promise.all([manifestPath, native, reference, report]
    .map(async path => [path, createHash("sha256").update(await readFile(path)).digest("hex")])));
  return { geometry, artifactHashes };
}

/** A claimed pass is not evidence; re-read and recompute all three observation inputs. */
export async function verifyCorpusGeometry(geometry: CorpusGeometryEvidence, viewport?: { width: number; height: number; mode: "app" | "fidelity" }): Promise<void> {
  if (geometry.tolerance !== 0.5) throw new Error("Corpus geometry tolerance changed");
  const native = JSON.parse(await readFile(geometry.native, "utf8"));
  if (viewport && (native.width !== viewport.width || native.height !== viewport.height || geometry.mode !== viewport.mode)) throw new Error("Corpus geometry belongs to a different viewport or mode");
  if (geometry.mode !== "app" && geometry.mode !== "fidelity") throw new Error("Invalid corpus geometry mode");
  const manifest = JSON.parse(await readFile(geometry.manifest, "utf8")) as GeometryManifest,
    chrome = JSON.parse(await readFile(geometry.reference, "utf8")) as ChromeGeometry;
  const comparison = compareGeometry(manifest, native, chrome, geometry.tolerance);
  const scroll = compareScrollRanges(manifest, parseNativeGeometry(native), chrome, geometry.mode, geometry.tolerance);
  const report = JSON.parse(await readFile(geometry.report, "utf8"));
  if (JSON.stringify({ comparison, scroll }) !== JSON.stringify(report) || JSON.stringify(comparison) !== JSON.stringify(geometry.comparison)
    || JSON.stringify(scroll) !== JSON.stringify(geometry.scroll)
    || geometry.passed !== (comparison.complete && comparison.matchingFrames && scroll.passed)) throw new Error("Corpus geometry report disagrees with actual observations");
}
