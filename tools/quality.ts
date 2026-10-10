/** Compare saved visual measurements without invoking a browser or simulator. */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

export interface CasePolicy { maxDrop?: number; minSsim?: number; maxMismatch?: number }
/** `features` keys are `<caseId>@<app|fidelity>`: a floor applies to one output mode only. */
export interface QualityPolicy { maxDrop?: number; minSsim?: number; anchorMaxMismatch?: number; cases?: Record<string, CasePolicy>; features?: Record<string, CasePolicy>; requireEvidence?: boolean; expectedSourceRevision?: string }
export interface QualityIssue {
  code: "invalid" | "policy" | "empty" | "missing" | "unexpected" | "regression" | "floor" | "geometry" | "artifact" | "dimensions" | "provenance";
  capture?: string;
  message: string;
}
export interface QualityAssessment { ok: boolean; checked: number; issues: QualityIssue[] }
interface Anchor { id: string; mismatch: number }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const score = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const positiveInteger = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const nonnegativeInteger = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const positiveNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const imageFiles = ["browser.png", "native.png", "diff.png"] as const;
const requiredFiles = [...imageFiles, "layout.json", "diagnostics.json", "warnings.json", "typecheck.json"] as const;
const configuration = ["chrome", "xcode", "renderer", "dpr", "viewportWidth", "viewportHeight", "loadedFonts", "rootWidthOverride", "fixtureHash", "harnessHash", "caseId", "mode", "theme"] as const;
const loaderKeys = ["_files", "_images", "_hashes"];
const sha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const DEFAULT_ANCHOR_MAX_MISMATCH = 0.1;

function validRule(rule: unknown): rule is CasePolicy {
  return record(rule) && Object.keys(rule).every(key => key === "maxDrop" || key === "minSsim" || key === "maxMismatch") &&
    [rule.maxDrop, rule.minSsim, rule.maxMismatch].every(value => value === undefined || score(value));
}

/** Anchor regions of a capture; absent means none. `undefined` when malformed. */
function anchorsOf(value: Record<string, unknown>): Anchor[] | undefined {
  const anchors = value.anchors ?? [];
  return Array.isArray(anchors) && anchors.every(a => record(a) && nonempty(a.id) && score(a.mismatch)) ? anchors as Anchor[] : undefined;
}

/** Scores and run configuration: required on both sides, and all a tracked manifest carries. */
function validateProvenance(value: Record<string, unknown>, capture: string, issues: QualityIssue[]) {
  if (!score(value.mismatch)) issues.push({ code: "invalid", capture, message: "Mismatch must be finite and in [0,1]." });
  if (!positiveInteger(value.width) || !positiveInteger(value.height)) issues.push({ code: "dimensions", capture, message: "Comparison requires positive integer image dimensions." });
  if (!/^[a-f0-9]{40}$/i.test(String(value.sourceRevision ?? "")) || !nonempty(value.capturedAt) ||
      Number.isNaN(Date.parse(value.capturedAt)) || configuration.some(key =>
        key === "dpr" ? !positiveNumber(value[key]) : key === "loadedFonts" ? !nonnegativeInteger(value[key]) :
        ["viewportWidth", "viewportHeight"].includes(key) ? !positiveInteger(value[key]) :
        ["fixtureHash", "harnessHash"].includes(key) ? !sha256(value[key]) : !nonempty(value[key]))) {
    issues.push({ code: "provenance", capture, message: "Source revision, capture time and complete runtime/capture configuration are required." });
  }
}

/** The PNGs and JSON behind the scores, present only when a run directory was loaded. */
function validateArtifacts(value: Record<string, unknown>, capture: string, issues: QualityIssue[]) {
  const files = value._files;
  if (!record(files) || requiredFiles.some(file => files[file] !== true)) {
    issues.push({ code: "artifact", capture, message: "Browser, native, diff, layout, diagnostics, warnings and typecheck artifacts are required; the current side must be a run directory." });
  }
  const declaredHashes = value.artifactHashes, actualHashes = value._hashes;
  if (!record(declaredHashes) || !record(actualHashes) || requiredFiles.some(file => !sha256(declaredHashes[file]) || declaredHashes[file] !== actualHashes[file])) {
    issues.push({ code: "artifact", capture, message: "Artifact contents do not match the hashes recorded with the comparison." });
  }
  const images = value._images;
  if (!record(images) || imageFiles.some(file => !record(images[file]) || images[file].width !== value.width || images[file].height !== value.height)) {
    issues.push({ code: "dimensions", capture, message: "Browser, native and diff PNGs must have the declared identical dimensions." });
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
  if (!record(policy) || Object.keys(policy).some(k => !["maxDrop", "minSsim", "anchorMaxMismatch", "cases", "features", "requireEvidence", "expectedSourceRevision"].includes(k)) ||
      (policy.anchorMaxMismatch !== undefined && !score(policy.anchorMaxMismatch)) ||
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
      issues.push({ code: "policy", capture, message: "Case policy must name a baseline capture and use maxDrop/minSsim/maxMismatch in [0,1]." });
    }
  }
  const features = (policy.features ?? {}) as Record<string, unknown>;
  for (const [feature, rule] of Object.entries(features)) {
    const [, caseId, mode] = /^(.+)@(app|fidelity)$/.exec(feature) ?? [];
    if (!caseId || !validRule(rule) || !Object.values(baseline).some(value => record(value) && value.caseId === caseId && value.mode === mode)) {
      issues.push({ code: "policy", message: `Feature policy ${feature} must be <caseId>@<app|fidelity> naming a baseline case and mode, with maxDrop/minSsim/maxMismatch in [0,1].` });
    }
  }
  const anchorLimit = (policy.anchorMaxMismatch as number | undefined) ?? DEFAULT_ANCHOR_MAX_MISMATCH;
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
      // A tracked manifest is a valid baseline (provenance only); the current side must be a run directory.
      validateProvenance(before, capture, issues);
      if (Object.hasOwn(before, "_files")) validateArtifacts(before, capture, issues);
      validateProvenance(after, capture, issues);
      validateArtifacts(after, capture, issues);
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
    const featureRule = features[`${String(after.caseId)}@${String(after.mode)}`] as CasePolicy | undefined;
    const allowed = caseRule.maxDrop ?? featureRule?.maxDrop ?? (policy.maxDrop as number | undefined) ?? 0.005;
    // Allow floating-point roundoff at the configured boundary, not a meaningful score drop.
    if (before.ssim - after.ssim > allowed + 1e-12) {
      issues.push({ code: "regression", capture, message: `SSIM ${before.ssim} → ${after.ssim}; allowed drop ${allowed}.` });
    }
    const floor = caseRule.minSsim ?? featureRule?.minSsim ?? (policy.minSsim as number | undefined);
    if (floor !== undefined && after.ssim + 1e-12 < floor) {
      issues.push({ code: "floor", capture, message: `SSIM ${after.ssim} is below required floor ${floor}.` });
    }
    const ceiling = caseRule.maxMismatch ?? featureRule?.maxMismatch;
    if (ceiling !== undefined && !(score(after.mismatch) && after.mismatch <= ceiling + 1e-12)) {
      issues.push({ code: "floor", capture, message: `Mismatch ${String(after.mismatch)} exceeds the allowed ${ceiling}.` });
    }
    const beforeAnchors = anchorsOf(before), afterAnchors = anchorsOf(after);
    if (!beforeAnchors || !afterAnchors) {
      issues.push({ code: "invalid", capture, message: "Anchors must be a list of { id, mismatch in [0,1] }." });
      continue;
    }
    if (beforeAnchors.map(a => a.id).join("\n") !== afterAnchors.map(a => a.id).join("\n")) {
      issues.push({ code: "geometry", capture, message: `Anchor list changed: [${beforeAnchors.map(a => a.id)}] → [${afterAnchors.map(a => a.id)}].` });
      continue;
    }
    afterAnchors.forEach((anchor, i) => {
      if (beforeAnchors[i]!.mismatch <= anchorLimit && anchor.mismatch > anchorLimit) {
        issues.push({ code: "geometry", capture, message: `Anchor ${anchor.id} regressed: mismatch ${beforeAnchors[i]!.mismatch} → ${anchor.mismatch} (limit ${anchorLimit}).` });
      } else if (featureRule && anchor.mismatch > anchorLimit) {
        issues.push({ code: "geometry", capture, message: `Anchor ${anchor.id} of an approved feature has mismatch ${anchor.mismatch} above ${anchorLimit}.` });
      }
    });
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

/** Tracked manifest from a complete, self-consistent run directory. Never run by CI: rebaselining is reviewed. */
async function writeBaseline(runDir: string, path: string) {
  const json: unknown = await Bun.file(join(runDir, "run.json")).json();
  const run: Record<string, unknown> = record(json) ? json : {};
  if (!positiveInteger(run.expected) || run.completed !== run.expected || !Array.isArray(run.errors) || run.errors.length) {
    throw new Error(`refusing to baseline an incomplete run: ${String(run.completed)}/${String(run.expected)} completed, ${Array.isArray(run.errors) ? run.errors.length : "unknown"} errors`);
  }
  const loaded = await loadComparisons(runDir) as Record<string, Record<string, unknown>>;
  const check = assessQuality(loaded, loaded, { requireEvidence: true });
  if (!check.ok) throw new Error(`refusing to baseline a run that fails its own evidence check: ${JSON.stringify(check.issues.slice(0, 5))}`);
  const keys = Object.keys(loaded).sort();
  const manifest = Object.fromEntries(keys.map(key => [key, Object.fromEntries(Object.entries(loaded[key]!).filter(([field]) => !loaderKeys.includes(field)))]));
  await Bun.write(path, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${keys.length} captures to ${path}`);
}

/** Markdown: per fixture domain × mode, then per case × mode; `app` rows first. */
function summarize(manifest: unknown): string {
  if (!record(manifest)) throw new Error("summary needs a capture manifest object");
  const groups = (keyOf: (c: Record<string, unknown>) => string) => {
    const out = new Map<string, Array<[string, Record<string, unknown>]>>();
    for (const [key, c] of Object.entries(manifest)) {
      if (!record(c) || !score(c.ssim) || !score(c.mismatch)) throw new Error(`capture ${key} lacks ssim/mismatch`);
      const group = `${String(c.mode)}\t${keyOf(c)}`;
      out.set(group, [...out.get(group) ?? [], [key, c]]);
    }
    return [...out].sort(([a], [b]) => a.localeCompare(b));
  };
  const mean = (values: number[]) => (values.reduce((a, b) => a + b, 0) / values.length).toFixed(4);
  const lines = ["| domain | mode | n | mean ssim | min ssim | mean mismatch | anchors ok |", "|---|---|---|---|---|---|---|"];
  for (const [group, rows] of groups(c => String(c.fixture).split("/")[0]!)) {
    const [mode, domain] = group.split("\t");
    const [minKey, min] = rows.reduce((lo, row) => (row[1].ssim as number) < (lo[1].ssim as number) ? row : lo);
    const anchors = rows.flatMap(([, c]) => anchorsOf(c) ?? []);
    lines.push(`| ${domain} | ${mode} | ${rows.length} | ${mean(rows.map(([, c]) => c.ssim as number))} | ${(min.ssim as number).toFixed(4)} (${minKey}) | ${mean(rows.map(([, c]) => c.mismatch as number))} | ${anchors.filter(a => a.mismatch <= DEFAULT_ANCHOR_MAX_MISMATCH).length}/${anchors.length} |`);
  }
  lines.push("", "| case | mode | n | min ssim | mean ssim | max mismatch |", "|---|---|---|---|---|---|");
  for (const [group, rows] of groups(c => String(c.caseId))) {
    const [mode, caseId] = group.split("\t");
    const ssims = rows.map(([, c]) => c.ssim as number);
    lines.push(`| ${caseId} | ${mode} | ${rows.length} | ${Math.min(...ssims).toFixed(4)} | ${mean(ssims)} | ${Math.max(...rows.map(([, c]) => c.mismatch as number)).toFixed(4)} |`);
  }
  return lines.join("\n");
}

const USAGE = `Usage: bun run tools/quality.ts <baseline-dir|manifest.json> <current-dir> [policy.json]
       bun run tools/quality.ts --write-baseline <run-dir> <manifest.json>
       bun run tools/quality.ts --summary <manifest.json>`;

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--write-baseline") {
      if (args.length !== 3) throw new Error(USAGE);
      await writeBaseline(args[1]!, args[2]!);
    } else if (args[0] === "--summary") {
      if (args.length !== 2) throw new Error(USAGE);
      console.log(summarize(await Bun.file(args[1]!).json()));
    } else {
      if (args.length < 2 || args.length > 3) throw new Error(USAGE);
      const [baseline, current] = await Promise.all([loadComparisons(args[0]!), loadComparisons(args[1]!)]);
      const policy: unknown = args[2] ? await Bun.file(args[2]).json() : {};
      const assessment = assessQuality(baseline, current, policy);
      console.log(JSON.stringify(assessment, null, 2));
      process.exitCode = assessment.ok ? 0 : 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
