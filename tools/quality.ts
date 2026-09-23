/** Compare saved visual measurements without invoking a browser or simulator. */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

export interface CasePolicy { maxDrop?: number; minSsim?: number }
export interface QualityPolicy { maxDrop?: number; minSsim?: number; cases?: Record<string, CasePolicy>; features?: Record<string, CasePolicy>; requireEvidence?: boolean; expectedSourceRevision?: string }
export interface QualityIssue {
  code: "invalid" | "policy" | "empty" | "missing" | "unexpected" | "regression" | "floor" | "artifact" | "dimensions" | "provenance";
  capture?: string;
  message: string;
}
export interface QualityAssessment { ok: boolean; checked: number; issues: QualityIssue[] }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const score = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const positiveInteger = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const nonnegativeInteger = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const positiveNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const imageFiles = ["browser.png", "ios.png", "diff.png"] as const;
const requiredFiles = [...imageFiles, "layout.json", "diagnostics.json", "warnings.json", "typecheck.json"] as const;
const configuration = ["chrome", "xcode", "simulator", "dpr", "viewportWidth", "viewportHeight", "loadedFonts", "rootWidthOverride", "fixtureHash", "harnessHash", "caseId", "mode", "theme"] as const;
const sha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

function validRule(rule: unknown): rule is CasePolicy {
  return record(rule) && Object.keys(rule).every(key => key === "maxDrop" || key === "minSsim") &&
    (rule.maxDrop === undefined || score(rule.maxDrop)) && (rule.minSsim === undefined || score(rule.minSsim));
}

function validateEvidence(value: Record<string, unknown>, capture: string, issues: QualityIssue[]) {
  if (!score(value.mismatch)) issues.push({ code: "invalid", capture, message: "Mismatch must be finite and in [0,1]." });
  if (!positiveInteger(value.width) || !positiveInteger(value.height)) issues.push({ code: "dimensions", capture, message: "Comparison requires positive integer image dimensions." });
  const files = value._files;
  if (!record(files) || requiredFiles.some(file => files[file] !== true)) {
    issues.push({ code: "artifact", capture, message: "Browser, iOS, diff, layout, diagnostics, warnings and typecheck artifacts are required." });
  }
  const declaredHashes = value.artifactHashes, actualHashes = value._hashes;
  if (!record(declaredHashes) || !record(actualHashes) || requiredFiles.some(file => !sha256(declaredHashes[file]) || declaredHashes[file] !== actualHashes[file])) {
    issues.push({ code: "artifact", capture, message: "Artifact contents do not match the hashes recorded with the comparison." });
  }
  const images = value._images;
  if (!record(images) || imageFiles.some(file => !record(images[file]) || images[file].width !== value.width || images[file].height !== value.height)) {
    issues.push({ code: "dimensions", capture, message: "Browser, iOS and diff PNGs must have the declared identical dimensions." });
  }
  if (!/^[a-f0-9]{40}$/i.test(String(value.sourceRevision ?? "")) || !nonempty(value.capturedAt) ||
      Number.isNaN(Date.parse(value.capturedAt)) || configuration.some(key =>
        key === "dpr" ? !positiveNumber(value[key]) : key === "loadedFonts" ? !nonnegativeInteger(value[key]) :
        ["viewportWidth", "viewportHeight"].includes(key) ? !positiveInteger(value[key]) :
        ["fixtureHash", "harnessHash"].includes(key) ? !sha256(value[key]) : !nonempty(value[key]))) {
    issues.push({ code: "provenance", capture, message: "Source revision, capture time and complete runtime/capture configuration are required." });
  }
}

/** Each key identifies one capture (including theme/viewport); each value has an SSIM score.
 * Strict evidence validation is opt-in for reviewed visual baselines.
 */
export function assessQuality(baseline: unknown, current: unknown, policy: unknown = {}): QualityAssessment {
  const issues: QualityIssue[] = [];
  let checked = 0;
  const result = (): QualityAssessment => ({ ok: issues.length === 0, checked, issues });
  if (!record(baseline) || !record(current)) {
    issues.push({ code: "invalid", message: "Baseline and current must be capture-ID objects." });
    return result();
  }
  if (!record(policy) || Object.keys(policy).some(k => !["maxDrop", "minSsim", "cases", "features", "requireEvidence", "expectedSourceRevision"].includes(k)) ||
      (policy.maxDrop !== undefined && !score(policy.maxDrop)) || (policy.minSsim !== undefined && !score(policy.minSsim)) ||
      (policy.cases !== undefined && !record(policy.cases)) || (policy.features !== undefined && !record(policy.features)) ||
      (policy.requireEvidence !== undefined && typeof policy.requireEvidence !== "boolean") ||
      (policy.expectedSourceRevision !== undefined && !/^[a-f0-9]{40}$/i.test(String(policy.expectedSourceRevision)))) {
    issues.push({ code: "policy", message: "Invalid quality policy or score threshold." });
    return result();
  }
  const cases = (policy.cases ?? {}) as Record<string, unknown>;
  for (const [capture, rule] of Object.entries(cases)) {
    if (!Object.hasOwn(baseline, capture) || !validRule(rule)) {
      issues.push({ code: "policy", capture, message: "Case policy must name a baseline capture and use maxDrop/minSsim in [0,1]." });
    }
  }
  const features = (policy.features ?? {}) as Record<string, unknown>;
  for (const [feature, rule] of Object.entries(features)) {
    if (!validRule(rule) || !Object.values(baseline).some(value => record(value) && value.caseId === feature)) {
      issues.push({ code: "policy", message: `Feature policy ${feature} must name a baseline feature and use maxDrop/minSsim in [0,1].` });
    }
  }
  if (issues.length) return result();
  if (!Object.keys(baseline).length) issues.push({ code: "empty", message: "Baseline must contain at least one capture." });
  const baselineRevisions = new Set<string>(), currentRevisions = new Set<string>();
  for (const capture of [...new Set([...Object.keys(baseline), ...Object.keys(current)])].sort()) {
    if (!Object.hasOwn(current, capture)) {
      issues.push({ code: "missing", capture, message: "Required capture is missing from current results." });
      continue;
    }
    if (!Object.hasOwn(baseline, capture)) {
      issues.push({ code: "unexpected", capture, message: "Capture is absent from baseline; review and baseline it explicitly." });
      continue;
    }
    const before = baseline[capture], after = current[capture];
    if (!record(before) || !score(before.ssim) || !record(after) || !score(after.ssim)) {
      issues.push({ code: "invalid", capture, message: "Both captures require finite numeric SSIM in [0,1]." });
      continue;
    }
    checked++;
    if (policy.requireEvidence) {
      validateEvidence(before, capture, issues);
      validateEvidence(after, capture, issues);
      if (nonempty(before.sourceRevision)) baselineRevisions.add(before.sourceRevision);
      if (nonempty(after.sourceRevision)) currentRevisions.add(after.sourceRevision);
      if (policy.expectedSourceRevision !== undefined && after.sourceRevision !== policy.expectedSourceRevision) {
        issues.push({ code: "provenance", capture, message: `Current capture revision does not match expected ${policy.expectedSourceRevision}.` });
      }
      for (const key of configuration) {
        if (before[key] !== after[key]) issues.push({ code: "provenance", capture, message: `Capture configuration changed: ${key}.` });
      }
      if (before.width !== after.width || before.height !== after.height) {
        issues.push({ code: "dimensions", capture, message: "Baseline and current image dimensions differ." });
      }
    }
    const caseRule = (cases[capture] ?? {}) as CasePolicy;
    const featureRule = (features[String(after.caseId)] ?? {}) as CasePolicy;
    const allowed = caseRule.maxDrop ?? featureRule.maxDrop ?? (policy.maxDrop as number | undefined) ?? 0.005;
    // Allow floating-point roundoff at the configured boundary, not a meaningful score drop.
    if (before.ssim - after.ssim > allowed + 1e-12) {
      issues.push({ code: "regression", capture, message: `SSIM ${before.ssim} → ${after.ssim}; allowed drop ${allowed}.` });
    }
    const floor = caseRule.minSsim ?? featureRule.minSsim ?? (policy.minSsim as number | undefined);
    if (floor !== undefined && after.ssim + 1e-12 < floor) {
      issues.push({ code: "floor", capture, message: `SSIM ${after.ssim} is below required floor ${floor}.` });
    }
  }
  if (policy.requireEvidence && (baselineRevisions.size > 1 || currentRevisions.size > 1)) {
    issues.push({ code: "provenance", message: "A run must come from one source revision." });
  }
  return result();
}

/** Load a manifest, or immediate <capture>/compare.json children of an output directory.
 * Internal underscore-prefixed directories are ignored. Missing files in capture directories
 * become invalid entries, so incomplete output cannot silently disappear on both sides.
 */
export async function loadComparisons(path: string): Promise<unknown> {
  if (!(await stat(path)).isDirectory()) return Bun.file(path).json();
  const captures: Record<string, unknown> = Object.create(null);
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const file = Bun.file(join(path, entry.name, "compare.json"));
    if (!(await file.exists())) { captures[entry.name] = null; continue; }
    const comparison: unknown = await file.json();
    if (!record(comparison)) { captures[entry.name] = comparison; continue; }
    const directory = join(path, entry.name);
    const files = Object.fromEntries(await Promise.all(requiredFiles.map(async name => [name, await Bun.file(join(directory, name)).exists()])));
    const hashes = Object.fromEntries(await Promise.all(requiredFiles.map(async name => [name, files[name]
      ? createHash("sha256").update(Buffer.from(await Bun.file(join(directory, name)).arrayBuffer())).digest("hex") : null])));
    const images = Object.fromEntries(await Promise.all(imageFiles.map(async name => {
      if (!files[name]) return [name, null];
      try {
        const metadata = await sharp(join(directory, name)).metadata();
        return [name, { width: metadata.width, height: metadata.height }];
      } catch { return [name, null]; }
    })));
    captures[entry.name] = { ...comparison, _files: files, _images: images, _hashes: hashes };
  }
  return captures;
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 2 || args.length > 3) throw new Error("Usage: bun run tools/quality.ts <baseline-dir|manifest.json> <current-dir|manifest.json> [policy.json]");
    const [baseline, current] = await Promise.all([loadComparisons(args[0]!), loadComparisons(args[1]!)]);
    const policy: unknown = args[2] ? await Bun.file(args[2]).json() : {};
    const assessment = assessQuality(baseline, current, policy);
    console.log(JSON.stringify(assessment, null, 2));
    process.exitCode = assessment.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
