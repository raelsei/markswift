import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { assessQuality, loadComparisons } from "../../../tools/quality.ts";

const baseline = { "card-light": { ssim: 0.95 }, "card-dark": { ssim: 0.94 } };
test("allows the boundary drop per capture, never hiding a regression with an improved average", () => {
  expect(assessQuality(baseline, { "card-light": { ssim: 0.945 }, "card-dark": { ssim: 1 } }).ok).toBe(true);
  const result = assessQuality(baseline, { "card-light": { ssim: 0.944 }, "card-dark": { ssim: 1 } });
  expect(result.ok).toBe(false);
  expect(result.issues.some(i => i.capture === "card-light" && i.code === "regression")).toBe(true);
});
test("requires identical nonempty capture sets", () => {
  const result = assessQuality(baseline, { "card-light": { ssim: 0.95 }, extra: { ssim: 1 } });
  expect(result.issues.map(i => i.code)).toEqual(["missing", "unexpected"]);
  expect(assessQuality({}, {}).ok).toBe(false);
});
test("rejects malformed and nonfinite scores on either side", () => {
  for (const score of [undefined, null, NaN, Infinity, -0.1, 1.1, "0.95"]) {
    const invalid = { x: { ssim: score } };
    expect(assessQuality(invalid, { x: { ssim: 1 } }).ok).toBe(false);
    expect(assessQuality({ x: { ssim: 1 } }, invalid).ok).toBe(false);
  }
  expect(assessQuality([], []).ok).toBe(false);
  expect(assessQuality({ x: null }, { x: null }).ok).toBe(false);
});
test("honors per-case allowances and independent absolute floors", () => {
  expect(assessQuality({ x: { ssim: 0.95 } }, { x: { ssim: 0.93 } }, { cases: { x: { maxDrop: 0.02 } } }).ok).toBe(true);
  const result = assessQuality({ x: { ssim: 0.8 } }, { x: { ssim: 0.85 } }, { cases: { x: { minSsim: 0.9 } } });
  expect(result.issues[0]?.code).toBe("floor");
  expect(assessQuality(baseline, baseline, { cases: { typo: { minSsim: 0.9 } } }).ok).toBe(false);
  expect(assessQuality(baseline, baseline, { maxDrop: -1 }).ok).toBe(false);
  expect(assessQuality(baseline, baseline, { maxDrop: NaN }).ok).toBe(false);
});
test("loads existing comparison directories and manifests, ignoring harness output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-"));
  try {
    await mkdir(join(dir, "card-light"));
    await mkdir(join(dir, "_harness"));
    await Bun.write(join(dir, "card-light/compare.json"), JSON.stringify(baseline["card-light"]));
    await Bun.write(join(dir, "_harness/compare.json"), "{}");
    const loaded = await loadComparisons(dir) as Record<string, Record<string, unknown>>;
    expect(Object.keys(loaded)).toEqual(["card-light"]);
    expect(loaded["card-light"]?.ssim).toBe(0.95);
    expect((loaded["card-light"]?._files as Record<string, boolean>)["ios.png"]).toBe(false);
    const manifest = join(dir, "manifest.json");
    await Bun.write(manifest, JSON.stringify(baseline));
    expect(await loadComparisons(manifest)).toEqual(baseline);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("CLI rejects incomplete capture artifacts and exits nonzero for regression", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-cli-"));
  try {
    await mkdir(join(dir, "incomplete"));
    const incomplete = await loadComparisons(dir);
    expect(assessQuality(incomplete, incomplete).ok).toBe(false);
    const before = join(dir, "before.json"), after = join(dir, "after.json");
    await Bun.write(before, JSON.stringify({ x: { ssim: 0.95 } }));
    await Bun.write(after, JSON.stringify({ x: { ssim: 0.8 } }));
    const run = Bun.spawn([process.execPath, join(import.meta.dir, "../../../tools/quality.ts"), before, after], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(run.stdout).text();
    expect(await run.exited).toBe(1);
    expect(JSON.parse(output).issues[0].code).toBe("regression");
    const pass = Bun.spawn([process.execPath, join(import.meta.dir, "../../../tools/quality.ts"), before, before], { stdout: "pipe", stderr: "pipe" });
    expect(await pass.exited).toBe(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const files = { "browser.png": true, "ios.png": true, "diff.png": true, "layout.json": true, "diagnostics.json": true, "warnings.json": true, "typecheck.json": true };
const evidence = (overrides: Record<string, unknown> = {}) => ({
  ssim: 0.98, mismatch: 0.03, width: 640, height: 200, caseId: "display-flex", mode: "app", theme: "light",
  viewportWidth: 320, viewportHeight: 2000, dpr: 2, loadedFonts: 0, rootWidthOverride: "[data-h2s-root] { width:100% !important }",
  sourceRevision: "a".repeat(40), capturedAt: "2026-09-23T04:00:00.000Z", chrome: "Chrome 140", xcode: "Xcode 26", simulator: "iPhone iOS-26",
  _files: { ...files }, _images: { "browser.png": { width: 640, height: 200 }, "ios.png": { width: 640, height: 200 }, "diff.png": { width: 640, height: 200 } },
  ...overrides,
});

test("strict evidence gate rejects missing render, wrong dimensions and invalid mismatch", () => {
  const before = { a: evidence() };
  const policy = { requireEvidence: true };
  expect(assessQuality(before, { a: evidence({ _files: { ...files, "ios.png": false } }) }, policy).issues.some(i => i.code === "artifact")).toBe(true);
  expect(assessQuality(before, { a: evidence({ _images: { "browser.png": { width: 640, height: 200 }, "ios.png": { width: 639, height: 200 }, "diff.png": { width: 640, height: 200 } } }) }, policy).issues.some(i => i.code === "dimensions")).toBe(true);
  expect(assessQuality(before, { a: evidence({ width: 600 }) }, policy).issues.some(i => i.code === "dimensions")).toBe(true);
  for (const mismatch of [-0.1, 1.1, NaN, "0.03"]) {
    expect(assessQuality(before, { a: evidence({ mismatch }) }, policy).issues.some(i => i.code === "invalid")).toBe(true);
  }
});

test("strict gate rejects missing provenance, stale revision and changed capture configuration", () => {
  const before = { a: evidence() };
  const policy = { requireEvidence: true, expectedSourceRevision: "b".repeat(40) };
  expect(assessQuality(before, { a: evidence({ sourceRevision: "b".repeat(40) }) }, policy).ok).toBe(true);
  expect(assessQuality(before, { a: evidence({ sourceRevision: undefined }) }, policy).issues.some(i => i.code === "provenance")).toBe(true);
  expect(assessQuality(before, { a: evidence() }, policy).issues.some(i => i.code === "provenance")).toBe(true);
  expect(assessQuality(before, { a: evidence({ sourceRevision: "b".repeat(40), dpr: 3 }) }, policy).issues.some(i => i.code === "provenance")).toBe(true);
  expect(assessQuality(before, { a: evidence({ sourceRevision: "b".repeat(40), loadedFonts: 1 }) }, policy).issues.some(i => i.code === "provenance")).toBe(true);
  expect(assessQuality(before, { a: evidence({ sourceRevision: "b".repeat(40), chrome: "Chrome 141" }) }, policy).issues.some(i => i.code === "provenance")).toBe(true);
});

test("feature floors reject an unchanged but unacceptable score", () => {
  const low = { a: evidence({ ssim: 0.92 }) };
  const result = assessQuality(low, low, { requireEvidence: true, features: { "display-flex": { minSsim: 0.95 } } });
  expect(result.issues.some(i => i.code === "floor")).toBe(true);
  const separateDropAllowance = assessQuality(low, low, { requireEvidence: true, features: { "display-flex": { minSsim: 0.95 } }, cases: { a: { maxDrop: 0.01 } } });
  expect(separateDropAllowance.issues.some(i => i.code === "floor")).toBe(true);
  expect(assessQuality(low, low, { requireEvidence: true, minSsim: 0.9 }).ok).toBe(true);
});

test("directory loader records required artifacts and actual PNG dimensions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-evidence-"));
  try {
    const capture = join(dir, "a");
    await mkdir(capture);
    await Bun.write(join(capture, "compare.json"), JSON.stringify(evidence()));
    for (const file of ["layout.json", "diagnostics.json", "warnings.json", "typecheck.json"]) await Bun.write(join(capture, file), "{}");
    const loaded = await loadComparisons(dir) as Record<string, Record<string, unknown>>;
    expect((loaded.a?._files as Record<string, boolean>)["ios.png"]).toBe(false);
    expect(assessQuality(loaded, loaded, { requireEvidence: true }).issues.some(i => i.code === "artifact")).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI strict gate catches deleted native render, below-floor score and changed provenance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-strict-cli-"));
  const before = join(dir, "before"), after = join(dir, "after"), revision = "b".repeat(40);
  const policy = join(dir, "policy.json");
  const png = await sharp({ create: { width: 640, height: 200, channels: 4, background: "#fff" } }).png().toBuffer();
  const create = async (root: string, comparison: Record<string, unknown>) => {
    const capture = join(root, "a");
    await mkdir(capture, { recursive: true });
    await Bun.write(join(capture, "compare.json"), JSON.stringify(comparison));
    for (const file of ["layout.json", "diagnostics.json", "warnings.json", "typecheck.json"]) await Bun.write(join(capture, file), "{}");
    for (const file of ["browser.png", "ios.png", "diff.png"]) await Bun.write(join(capture, file), png);
  };
  const invoke = async () => {
    const run = Bun.spawn([process.execPath, join(import.meta.dir, "../../../tools/quality.ts"), before, after, policy], { stdout: "pipe", stderr: "pipe" });
    const output = JSON.parse(await new Response(run.stdout).text());
    return { exit: await run.exited, output };
  };
  try {
    await create(before, evidence());
    await create(after, evidence({ sourceRevision: revision }));
    await Bun.write(policy, JSON.stringify({ requireEvidence: true, expectedSourceRevision: revision, features: { "display-flex": { minSsim: 0.95 } } }));
    expect((await invoke()).exit).toBe(0);
    await rm(join(after, "a", "ios.png"));
    expect((await invoke()).output.issues.some((issue: { code: string }) => issue.code === "artifact")).toBe(true);
    await Bun.write(join(after, "a", "ios.png"), png);
    await Bun.write(join(after, "a", "compare.json"), JSON.stringify(evidence({ sourceRevision: revision, ssim: 0.90 })));
    expect((await invoke()).output.issues.some((issue: { code: string }) => issue.code === "floor")).toBe(true);
    await Bun.write(join(after, "a", "compare.json"), JSON.stringify(evidence({ sourceRevision: revision, chrome: "Chrome 141" })));
    expect((await invoke()).output.issues.some((issue: { code: string }) => issue.code === "provenance")).toBe(true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
