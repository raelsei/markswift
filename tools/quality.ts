/** Compare saved visual measurements without invoking a browser or simulator. */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface CasePolicy { maxDrop?: number; minSsim?: number }
export interface QualityPolicy { maxDrop?: number; cases?: Record<string, CasePolicy> }
export interface QualityIssue {
  code: "invalid" | "policy" | "empty" | "missing" | "unexpected" | "regression" | "floor";
  capture?: string;
  message: string;
}
export interface QualityAssessment { ok: boolean; checked: number; issues: QualityIssue[] }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const score = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/** Each key identifies one capture (including theme/viewport); each value has an SSIM score.
 * Extra compare.json fields are retained by loaders but do not influence this SSIM gate.
 */
export function assessQuality(baseline: unknown, current: unknown, policy: unknown = {}): QualityAssessment {
  const issues: QualityIssue[] = [];
  let checked = 0;
  const result = (): QualityAssessment => ({ ok: issues.length === 0, checked, issues });
  if (!record(baseline) || !record(current)) {
    issues.push({ code: "invalid", message: "Baseline and current must be capture-ID objects." });
    return result();
  }
  if (!record(policy) || Object.keys(policy).some(k => !["maxDrop", "cases"].includes(k)) ||
      (policy.maxDrop !== undefined && !score(policy.maxDrop)) || (policy.cases !== undefined && !record(policy.cases))) {
    issues.push({ code: "policy", message: "Policy accepts maxDrop in [0,1] and a cases object." });
    return result();
  }
  const cases = (policy.cases ?? {}) as Record<string, unknown>;
  for (const [capture, rule] of Object.entries(cases)) {
    if (!Object.hasOwn(baseline, capture) || !record(rule) ||
        Object.keys(rule).some(k => !["maxDrop", "minSsim"].includes(k)) ||
        (rule.maxDrop !== undefined && !score(rule.maxDrop)) || (rule.minSsim !== undefined && !score(rule.minSsim))) {
      issues.push({ code: "policy", capture, message: "Case policy must name a baseline capture and use maxDrop/minSsim in [0,1]." });
    }
  }
  if (issues.length) return result();
  if (!Object.keys(baseline).length) issues.push({ code: "empty", message: "Baseline must contain at least one capture." });
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
    const rule = (cases[capture] ?? {}) as CasePolicy;
    const allowed = rule.maxDrop ?? (policy.maxDrop as number | undefined) ?? 0.005;
    // Allow floating-point roundoff at the configured boundary, not a meaningful score drop.
    if (before.ssim - after.ssim > allowed + 1e-12) {
      issues.push({ code: "regression", capture, message: `SSIM ${before.ssim} → ${after.ssim}; allowed drop ${allowed}.` });
    }
    if (rule.minSsim !== undefined && after.ssim + 1e-12 < rule.minSsim) {
      issues.push({ code: "floor", capture, message: `SSIM ${after.ssim} is below required floor ${rule.minSsim}.` });
    }
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
    captures[entry.name] = await file.exists() ? await file.json() : null;
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
