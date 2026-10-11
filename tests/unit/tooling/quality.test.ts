import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { assessQuality, driftHint, loadComparisons } from "../../../tools/quality.ts";

const baseline = { "card-light": { ssim: 0.95 }, "card-dark": { ssim: 0.94 } };
test("allows the boundary drop per capture, never hiding a regression with an improved average", () => {
  expect(assessQuality(baseline, { "card-light": { ssim: 0.945 }, "card-dark": { ssim: 1 } }).ok).toBe(true);
  const result = assessQuality(baseline, { "card-light": { ssim: 0.944 }, "card-dark": { ssim: 1 } });
  expect(result.ok).toBe(false);
  expect(result.issues.some((i) => i.capture === "card-light" && i.code === "regression")).toBe(true);
});
test("requires identical nonempty capture sets", () => {
  const result = assessQuality(baseline, { "card-light": { ssim: 0.95 }, extra: { ssim: 1 } });
  expect(result.issues.map((i) => i.code)).toEqual(["missing", "unexpected"]);
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
  expect(assessQuality({ x: { ssim: 0.95 } }, { x: { ssim: 0.93 } }, { cases: { x: { maxDrop: 0.02 } } }).ok).toBe(
    true,
  );
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
    const loaded = (await loadComparisons(dir)) as Record<string, Record<string, unknown>>;
    expect(Object.keys(loaded)).toEqual(["card-light"]);
    expect(loaded["card-light"]?.ssim).toBe(0.95);
    expect((loaded["card-light"]!._files as Record<string, boolean>)["native.png"]).toBe(false);
    const manifest = join(dir, "manifest.json");
    await Bun.write(manifest, JSON.stringify(baseline));
    expect(await loadComparisons(manifest)).toEqual(baseline);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("CLI rejects incomplete capture artifacts and exits nonzero for regression", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-cli-"));
  try {
    await mkdir(join(dir, "incomplete"));
    const incomplete = await loadComparisons(dir);
    expect(assessQuality(incomplete, incomplete).ok).toBe(false);
    const before = join(dir, "before.json"),
      after = join(dir, "after.json");
    await Bun.write(before, JSON.stringify({ x: { ssim: 0.95 } }));
    await Bun.write(after, JSON.stringify({ x: { ssim: 0.8 } }));
    const run = Bun.spawn([process.execPath, join(import.meta.dir, "../../../tools/quality.ts"), before, after], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(run.stdout).text();
    expect(await run.exited).toBe(1);
    expect(JSON.parse(output).issues[0].code).toBe("regression");
    const pass = Bun.spawn([process.execPath, join(import.meta.dir, "../../../tools/quality.ts"), before, before], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await pass.exited).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const files = {
  "browser.png": true,
  "native.png": true,
  "diff.png": true,
  "layout.json": true,
  "diagnostics.json": true,
  "warnings.json": true,
  "typecheck.json": true,
};
const artifactHashes = Object.fromEntries(Object.keys(files).map((name) => [name, "a".repeat(64)]));
const evidence = (overrides: Record<string, unknown> = {}) => ({
  ssim: 0.98,
  mismatch: 0.03,
  width: 640,
  height: 200,
  caseId: "display-flex",
  mode: "app",
  theme: "light",
  viewportWidth: 320,
  viewportHeight: 2000,
  dpr: 2,
  loadedFonts: 0,
  rootWidthOverride: "[data-markswift-root] { width:100% !important }",
  sourceRevision: "a".repeat(40),
  capturedAt: "2026-09-23T04:00:00.000Z",
  chrome: "Chrome 140",
  xcode: "Xcode 26",
  renderer: "iPhone iOS-26",
  fixtureHash: "c".repeat(64),
  harnessHash: "d".repeat(64),
  artifactHashes: { ...artifactHashes },
  _hashes: { ...artifactHashes },
  _files: { ...files },
  _images: {
    "browser.png": { width: 640, height: 200 },
    "native.png": { width: 640, height: 200 },
    "diff.png": { width: 640, height: 200 },
  },
  ...overrides,
});

test("strict evidence gate rejects missing render, wrong dimensions and invalid mismatch", () => {
  const before = { a: evidence() };
  const policy = { requireEvidence: true };
  expect(
    assessQuality(before, { a: evidence({ _files: { ...files, "native.png": false } }) }, policy).issues.some(
      (i) => i.code === "artifact",
    ),
  ).toBe(true);
  expect(
    assessQuality(
      before,
      {
        a: evidence({
          _images: {
            "browser.png": { width: 640, height: 200 },
            "native.png": { width: 639, height: 200 },
            "diff.png": { width: 640, height: 200 },
          },
        }),
      },
      policy,
    ).issues.some((i) => i.code === "dimensions"),
  ).toBe(true);
  expect(
    assessQuality(before, { a: evidence({ width: 600 }) }, policy).issues.some((i) => i.code === "dimensions"),
  ).toBe(true);
  for (const mismatch of [-0.1, 1.1, NaN, "0.03"]) {
    expect(assessQuality(before, { a: evidence({ mismatch }) }, policy).issues.some((i) => i.code === "invalid")).toBe(
      true,
    );
  }
});

test("strict gate rejects missing provenance, stale revision and changed capture configuration", () => {
  const before = { a: evidence() };
  const policy = { requireEvidence: true, expectedSourceRevision: "b".repeat(40) };
  expect(assessQuality(before, { a: evidence({ sourceRevision: "b".repeat(40) }) }, policy).ok).toBe(true);
  expect(
    assessQuality(before, { a: evidence({ sourceRevision: undefined }) }, policy).issues.some(
      (i) => i.code === "provenance",
    ),
  ).toBe(true);
  expect(assessQuality(before, { a: evidence() }, policy).issues.some((i) => i.code === "provenance")).toBe(true);
  expect(
    assessQuality(before, { a: evidence({ sourceRevision: "b".repeat(40), dpr: 3 }) }, policy).issues.some(
      (i) => i.code === "provenance",
    ),
  ).toBe(true);
  expect(
    assessQuality(before, { a: evidence({ sourceRevision: "b".repeat(40), loadedFonts: 1 }) }, policy).issues.some(
      (i) => i.code === "provenance",
    ),
  ).toBe(true);
  expect(
    assessQuality(
      before,
      { a: evidence({ sourceRevision: "b".repeat(40), fixtureHash: "e".repeat(64) }) },
      policy,
    ).issues.some((i) => i.code === "provenance"),
  ).toBe(true);
  expect(
    assessQuality(
      before,
      { a: evidence({ sourceRevision: "b".repeat(40), harnessHash: "e".repeat(64) }) },
      policy,
    ).issues.some((i) => i.code === "provenance"),
  ).toBe(true);
  expect(
    assessQuality(
      before,
      { a: evidence({ sourceRevision: "b".repeat(40), chrome: "Chrome 141" }) },
      policy,
    ).issues.some((i) => i.code === "provenance"),
  ).toBe(true);
});

test("toolchain-only drift prints a rebaseline hint naming the changed values", () => {
  const r = assessQuality({ a: evidence() }, { a: evidence({ xcode: "Xcode 27.1" }) }, { requireEvidence: true });
  expect(r.ok).toBe(false);
  expect(driftHint(r)).toContain('xcode ("Xcode 26" → "Xcode 27.1")');
  expect(driftHint(r)).toContain("rebaseline=true");
});

test("drift with a score regression asks for review, and no drift gives no hint", () => {
  const policy = { requireEvidence: true };
  const before = { a: evidence() };
  expect(driftHint(assessQuality(before, { a: evidence({ renderer: "iPhone iOS-27", ssim: 0.9 }) }, policy))).toContain(
    "review the diffs",
  );
  expect(driftHint(assessQuality(before, { a: evidence({ ssim: 0.9 }) }, policy))).toBeUndefined();
  expect(driftHint(assessQuality(before, { a: evidence({ fixtureHash: "e".repeat(64) }) }, policy))).toBeUndefined();
});

test("strict gate binds comparison scores to exact artifact contents", () => {
  const before = { a: evidence() };
  const altered = evidence({ _hashes: { ...artifactHashes, "native.png": "b".repeat(64) } });
  expect(
    assessQuality(before, { a: altered }, { requireEvidence: true }).issues.some((i) => i.code === "artifact"),
  ).toBe(true);
});

test("feature floors reject an unchanged but unacceptable score", () => {
  const low = { a: evidence({ ssim: 0.92 }) };
  const result = assessQuality(low, low, {
    requireEvidence: true,
    features: { "display-flex@app": { minSsim: 0.95 } },
  });
  expect(result.issues.some((i) => i.code === "floor")).toBe(true);
  const separateDropAllowance = assessQuality(low, low, {
    requireEvidence: true,
    features: { "display-flex@app": { minSsim: 0.95 } },
    cases: { a: { maxDrop: 0.01 } },
  });
  expect(separateDropAllowance.issues.some((i) => i.code === "floor")).toBe(true);
  expect(assessQuality(low, low, { requireEvidence: true, minSsim: 0.9 }).ok).toBe(true);
});

test("directory loader records required artifacts and actual PNG dimensions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-evidence-"));
  try {
    const capture = join(dir, "a");
    await mkdir(capture);
    await Bun.write(join(capture, "compare.json"), JSON.stringify(evidence()));
    for (const file of ["layout.json", "diagnostics.json", "warnings.json", "typecheck.json"])
      await Bun.write(join(capture, file), "{}");
    const loaded = (await loadComparisons(dir)) as Record<string, Record<string, unknown>>;
    expect((loaded.a!._files as Record<string, boolean>)["native.png"]).toBe(false);
    expect(assessQuality(loaded, loaded, { requireEvidence: true }).issues.some((i) => i.code === "artifact")).toBe(
      true,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI strict gate catches deleted native render, below-floor score and changed provenance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-strict-cli-"));
  const before = join(dir, "before"),
    after = join(dir, "after"),
    revision = "b".repeat(40);
  const policy = join(dir, "policy.json");
  const png = await sharp({ create: { width: 640, height: 200, channels: 4, background: "#fff" } })
    .png()
    .toBuffer();
  const replacement = await sharp({ create: { width: 640, height: 200, channels: 4, background: "#f0f" } })
    .png()
    .toBuffer();
  let afterHashes: Record<string, string> = {};
  const create = async (root: string, comparison: Record<string, unknown>) => {
    const capture = join(root, "a");
    await mkdir(capture, { recursive: true });
    await Bun.write(join(capture, "compare.json"), JSON.stringify(comparison));
    for (const file of ["layout.json", "diagnostics.json", "warnings.json", "typecheck.json"])
      await Bun.write(join(capture, file), "{}");
    for (const file of ["browser.png", "native.png", "diff.png"]) await Bun.write(join(capture, file), png);
    const hashes = Object.fromEntries(
      await Promise.all(
        Object.keys(files).map(async (name) => [
          name,
          createHash("sha256")
            .update(Buffer.from(await Bun.file(join(capture, name)).arrayBuffer()))
            .digest("hex"),
        ]),
      ),
    );
    await Bun.write(join(capture, "compare.json"), JSON.stringify({ ...comparison, artifactHashes: hashes }));
    return hashes;
  };
  const invoke = async () => {
    const run = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../../../tools/quality.ts"), before, after, policy],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = JSON.parse(await new Response(run.stdout).text());
    return { exit: await run.exited, output, stderr: await new Response(run.stderr).text() };
  };
  try {
    await create(before, evidence());
    afterHashes = await create(after, evidence({ sourceRevision: revision }));
    await Bun.write(
      policy,
      JSON.stringify({
        requireEvidence: true,
        expectedSourceRevision: revision,
        features: { "display-flex@app": { minSsim: 0.95 } },
      }),
    );
    expect((await invoke()).exit).toBe(0);
    await Bun.write(join(after, "a", "native.png"), replacement);
    expect((await invoke()).output.issues.some((issue: { code: string }) => issue.code === "artifact")).toBe(true);
    await Bun.write(join(after, "a", "native.png"), png);
    await rm(join(after, "a", "native.png"));
    expect((await invoke()).output.issues.some((issue: { code: string }) => issue.code === "artifact")).toBe(true);
    await Bun.write(join(after, "a", "native.png"), png);
    await Bun.write(
      join(after, "a", "compare.json"),
      JSON.stringify(evidence({ sourceRevision: revision, ssim: 0.9, artifactHashes: afterHashes })),
    );
    expect((await invoke()).output.issues.some((issue: { code: string }) => issue.code === "floor")).toBe(true);
    await Bun.write(
      join(after, "a", "compare.json"),
      JSON.stringify(evidence({ sourceRevision: revision, chrome: "Chrome 141", artifactHashes: afterHashes })),
    );
    const drifted = await invoke();
    expect(drifted.output.issues.some((issue: { code: string }) => issue.code === "provenance")).toBe(true);
    expect(drifted.stderr).toContain("Toolchain drift: chrome");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a tracked manifest is a strict baseline, never a strict current", () => {
  const { _files, _images, _hashes, ...manifestEntry } = evidence();
  const policy = { requireEvidence: true };
  expect(assessQuality({ a: manifestEntry }, { a: evidence() }, policy)).toMatchObject({ ok: true, checked: 1 });
  expect(assessQuality({ a: evidence() }, { a: manifestEntry }, policy).issues.some((i) => i.code === "artifact")).toBe(
    true,
  );
});

test("feature rules are keyed <caseId>@<mode>; a bare case id is a policy error", () => {
  const a = { a: evidence() };
  expect(
    assessQuality(a, a, { requireEvidence: true, features: { "display-flex": { minSsim: 0.5 } } }).issues.map(
      (i) => i.code,
    ),
  ).toEqual(["policy"]);
  expect(
    assessQuality(a, a, { requireEvidence: true, features: { "display-flex@fidelity": { minSsim: 0.5 } } }).issues.map(
      (i) => i.code,
    ),
  ).toEqual(["policy"]);
  expect(assessQuality(a, a, { requireEvidence: true, features: { "display-flex@app": { minSsim: 0.5 } } }).ok).toBe(
    true,
  );
});

test("maxMismatch caps pixel mismatch as a floor", () => {
  const a = { a: evidence({ mismatch: 0.06 }) };
  expect(
    assessQuality(a, a, { features: { "display-flex@app": { maxMismatch: 0.05 } } }).issues.map((i) => i.code),
  ).toEqual(["floor"]);
  expect(assessQuality(a, a, { cases: { a: { maxMismatch: 0.06 } } }).ok).toBe(true);
});

test("anchor regions catch regressions, changed anchor lists and failing approved features", () => {
  const at = (...mismatch: number[]) =>
    evidence({ anchors: mismatch.map((m, i) => ({ id: `#anchor-${i}`, mismatch: m })) });
  const codes = (before: object, after: object, policy: object = {}) =>
    assessQuality({ a: before }, { a: after }, policy).issues.map((i) => i.code);
  expect(codes(at(0.05, 0.3), at(0.09, 0.4))).toEqual([]);
  expect(codes(at(0.05), at(0.2))).toEqual(["geometry"]);
  expect(codes(at(0.05), at(0.2), { anchorMaxMismatch: 0.25 })).toEqual([]);
  expect(codes(at(0.05, 0.05), at(0.05))).toEqual(["geometry"]);
  expect(codes(at(0.3), at(0.3), { features: { "display-flex@app": {} } })).toEqual(["geometry"]);
  expect(codes(at(0.3), at(0.3), { features: { "display-flex@app": {} }, anchorMaxMismatch: 0.5 })).toEqual([]);
});

test("CLI --write-baseline refuses an incomplete run and --summary prints domain × mode rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-quality-baseline-"));
  const cli = async (...args: string[]) => {
    const run = Bun.spawn([process.execPath, join(import.meta.dir, "../../../tools/quality.ts"), ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
    return { exit: await run.exited, stdout, stderr };
  };
  try {
    await Bun.write(
      join(dir, "run", "run.json"),
      JSON.stringify({ expected: 8, completed: 7, errors: ["x: capture failed"] }),
    );
    const refused = await cli("--write-baseline", join(dir, "run"), join(dir, "manifest.json"));
    expect(refused.exit).toBe(1);
    expect(refused.stderr).toContain("incomplete run: 7/8");
    expect(await Bun.file(join(dir, "manifest.json")).exists()).toBe(false);
    const manifest = {
      "display-flex-320-light-app": evidence({
        fixture: "css-layout/display--flex.html",
        anchors: [{ id: "#flex-row", mismatch: 0.02 }],
      }),
      "display-flex-320-light-fidelity": evidence({ fixture: "css-layout/display--flex.html", mode: "fidelity" }),
      "img-320-light-app": evidence({ fixture: "html/img.html", caseId: "image", ssim: 0.9 }),
    };
    await Bun.write(join(dir, "summary.json"), JSON.stringify(manifest));
    const summary = await cli("--summary", join(dir, "summary.json"));
    expect(summary.exit).toBe(0);
    const rows = summary.stdout.split("\n").filter((line) => /^\| (css-layout|html) /.test(line));
    expect(rows).toEqual([
      "| css-layout | app | 1 | 0.9800 | 0.9800 (display-flex-320-light-app) | 0.0300 | 1/1 |",
      "| html | app | 1 | 0.9000 | 0.9000 (img-320-light-app) | 0.0300 | 0/0 |",
      "| css-layout | fidelity | 1 | 0.9800 | 0.9800 (display-flex-320-light-fidelity) | 0.0300 | 0/0 |",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
