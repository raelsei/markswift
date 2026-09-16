import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    expect(await loadComparisons(dir)).toEqual({ "card-light": baseline["card-light"] });
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
