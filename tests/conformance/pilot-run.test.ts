import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const swiftTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

test("pilot rejects an unknown flag with a usage error instead of running the default renderer", async () => {
  const run = Bun.spawn([process.execPath, join(import.meta.dir, "pilot-run.ts"), "--no-sim"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
  expect(await run.exited).toBe(2);
  expect(stdout).toBe("");
  expect(stderr).toContain("--no-sim");
  expect(stderr).toContain("usage: bun tests/conformance/pilot-run.ts");
});

browserTest(
  "render-free pilot captures every expected mode, theme and width with typed Swift",
  async () => {
    const parent = await mkdtemp(join(tmpdir(), "markswift-pilot-test-"));
    const out = join(parent, "run");
    try {
      const run = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "pilot-run.ts"),
          "--renderer",
          "none",
          "--only",
          "display-flex",
          "--out",
          out,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
      expect(await run.exited).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("expected 8");
      const report = await Bun.file(join(out, "run.json")).json();
      expect(report).toMatchObject({ expected: 8, completed: 8, errors: [] });
      expect(report.environment.harnessHash).toMatch(/^[a-f0-9]{64}$/);
      expect(report.environment.fixtureHashes["display-flex"]).toMatch(/^[a-f0-9]{64}$/);
      for (const entry of report.entries) {
        for (const name of ["browser.png", "layout.json", "diagnostics.json", "warnings.json", "typecheck.json"]) {
          expect(await Bun.file(join(out, entry.key, name)).exists()).toBe(true);
        }
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  },
  120_000,
);

browserTest(
  "pilot refuses an existing output directory without deleting its reviewed contents",
  async () => {
    const out = await mkdtemp(join(tmpdir(), "markswift-pilot-protected-"));
    const marker = join(out, "reviewed-baseline.txt");
    await Bun.write(marker, "keep this baseline");
    try {
      const run = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "pilot-run.ts"),
          "--renderer",
          "none",
          "--only",
          "display-flex",
          "--out",
          out,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const stderr = await new Response(run.stderr).text();
      expect(await run.exited).toBe(1);
      expect(stderr).toContain("output already exists");
      expect(await Bun.file(marker).text()).toBe("keep this baseline");
      expect(await Bun.file(join(out, "run.json")).exists()).toBe(false);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  },
  120_000,
);

swiftTest(
  "macOS pilot renders, scores and records anchors with provenance",
  async () => {
    const parent = await mkdtemp(join(tmpdir(), "markswift-pilot-mac-"));
    const out = join(parent, "run");
    try {
      const run = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "pilot-run.ts"),
          "--renderer",
          "mac",
          "--only",
          "display-flex",
          "--out",
          out,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
      if ((await run.exited) !== 0) throw new Error(stderr);
      const report = await Bun.file(join(out, "run.json")).json();
      expect(report).toMatchObject({ expected: 8, completed: 8, errors: [] });
      for (const entry of report.entries) {
        for (const name of ["native.png", "diff.png"])
          expect(await Bun.file(join(out, entry.key, name)).exists()).toBe(true);
        const score = await Bun.file(join(out, entry.key, "compare.json")).json();
        expect(score.renderer).toStartWith("macOS ");
        expect(score.ssim).toBeGreaterThanOrEqual(0);
        expect(score.ssim).toBeLessThanOrEqual(1);
        expect(score.anchors.map((a: { id: string }) => a.id)).toEqual(["#flex-row", "#flex-self"]);
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  },
  600_000,
);
