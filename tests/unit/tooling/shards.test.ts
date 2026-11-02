import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseShard, shardCases } from "../../conformance/pilot-run.ts";
import { mergeRuns } from "../../../tools/quality.ts";

test("parseShard parses valid 1-based shard specifications", () => {
  expect(parseShard("1/3")).toEqual({ index: 1, total: 3 });
  expect(parseShard("2/4")).toEqual({ index: 2, total: 4 });
  expect(parseShard("4/4")).toEqual({ index: 4, total: 4 });
  expect(parseShard("  1/1  ")).toEqual({ index: 1, total: 1 });
});

test("parseShard rejects invalid shard formats and out-of-range indices", () => {
  expect(() => parseShard("0/3")).toThrow("invalid shard");
  expect(() => parseShard("4/3")).toThrow("exceeds total");
  expect(() => parseShard("1/0")).toThrow("invalid shard");
  expect(() => parseShard("-1/3")).toThrow("invalid shard");
  expect(() => parseShard("abc")).toThrow("invalid shard");
  expect(() => parseShard("1")).toThrow("invalid shard");
  expect(() => parseShard("1/2/3")).toThrow("invalid shard");
});

test("shardCases partitions deterministically without overlapping or dropping cases", () => {
  const items = Array.from({ length: 17 }, (_, i) => `case-${i}`);
  const total = 4;
  const shards = Array.from({ length: total }, (_, i) => shardCases(items, i + 1, total));

  // Balanced sizes: 17 split over 4 shards -> 5, 4, 4, 4
  expect(shards.map((s) => s.length)).toEqual([5, 4, 4, 4]);

  // Disjoint partitions: no item appears twice
  const allSharded = shards.flat();
  expect(new Set(allSharded).size).toBe(items.length);

  // Completeness: all original items are preserved
  expect(allSharded.sort()).toEqual([...items].sort());

  // Determinism: calling again produces the exact same shards
  for (let i = 1; i <= total; i++) {
    expect(shardCases(items, i, total)).toEqual(shards[i - 1]!);
  }
});

test("mergeRuns combines shard directories, captures and run.json", async () => {
  const parent = await mkdtemp(join(tmpdir(), "markswift-shard-test-"));
  try {
    const shard1 = join(parent, "shard1");
    const shard2 = join(parent, "shard2");
    const merged = join(parent, "merged");

    await mkdir(join(shard1, "card-light"), { recursive: true });
    await mkdir(join(shard2, "card-dark"), { recursive: true });

    await Bun.write(join(shard1, "card-light/compare.json"), JSON.stringify({ ssim: 0.95, key: "card-light" }));
    await Bun.write(join(shard2, "card-dark/compare.json"), JSON.stringify({ ssim: 0.94, key: "card-dark" }));

    const env1 = {
      sourceRevision: "abc123",
      harnessHash: "hash1",
      chrome: "Chromium 130",
      xcode: "Xcode 16.0",
      renderer: "macOS 15.0",
      capturedAt: "2026-11-02T10:00:00.000Z",
      fixtureHashes: { card: "card-hash-1" },
    };
    const env2 = {
      ...env1,
      capturedAt: "2026-11-02T10:05:00.000Z",
      fixtureHashes: { card: "card-hash-1", button: "btn-hash" },
    };

    await Bun.write(
      join(shard1, "run.json"),
      JSON.stringify({
        expected: 1,
        completed: 1,
        errors: [],
        environment: env1,
        entries: [{ key: "card-light", ssim: 0.95 }],
      }),
    );
    await Bun.write(
      join(shard2, "run.json"),
      JSON.stringify({
        expected: 1,
        completed: 1,
        errors: ["warning on button"],
        environment: env2,
        entries: [{ key: "card-dark", ssim: 0.94 }],
      }),
    );

    await mergeRuns(merged, [shard1, shard2]);

    expect(await Bun.file(join(merged, "card-light/compare.json")).exists()).toBe(true);
    expect(await Bun.file(join(merged, "card-dark/compare.json")).exists()).toBe(true);

    const mergedReport = (await Bun.file(join(merged, "run.json")).json()) as {
      expected: number;
      completed: number;
      errors: string[];
      entries: Array<{ key: string }>;
      environment: { fixtureHashes: Record<string, string>; capturedAt: string };
    };

    expect(mergedReport.expected).toBe(2);
    expect(mergedReport.completed).toBe(2);
    expect(mergedReport.errors).toEqual(["warning on button"]);
    expect(mergedReport.entries.map((e) => e.key)).toEqual(["card-dark", "card-light"]);
    expect(mergedReport.environment.fixtureHashes).toEqual({ card: "card-hash-1", button: "btn-hash" });
    expect(mergedReport.environment.capturedAt).toBe("2026-11-02T10:00:00.000Z");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("mergeRuns throws on duplicate captures or missing run.json", async () => {
  const parent = await mkdtemp(join(tmpdir(), "markswift-shard-err-"));
  try {
    const s1 = join(parent, "s1");
    const s2 = join(parent, "s2");
    await mkdir(join(s1, "dup"), { recursive: true });
    await mkdir(join(s2, "dup"), { recursive: true });
    await Bun.write(join(s1, "run.json"), JSON.stringify({ expected: 1, completed: 1, errors: [] }));
    await Bun.write(join(s2, "run.json"), JSON.stringify({ expected: 1, completed: 1, errors: [] }));

    expect(mergeRuns(join(parent, "out"), [s1, s2])).rejects.toThrow("duplicate capture");

    const sMissing = join(parent, "smissing");
    await mkdir(sMissing, { recursive: true });
    expect(mergeRuns(join(parent, "out2"), [sMissing])).rejects.toThrow("lacks run.json");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("visual.yml workflow file parses and specifies sharded all scope", () => {
  const proc = Bun.spawnSync([
    "python3",
    "-c",
    "import yaml, json, sys; json.dump(yaml.safe_load(open('.github/workflows/visual.yml')), sys.stdout)",
  ]);
  expect(proc.exitCode).toBe(0);
  const workflow = JSON.parse(proc.stdout.toString());
  expect(workflow.jobs["visual"]).toBeDefined();
  expect(workflow.jobs["visual-shard"]).toBeDefined();
  expect(workflow.jobs["visual-merge"]).toBeDefined();

  // Matrix specification on visual-shard
  const matrix = workflow.jobs["visual-shard"].strategy?.matrix;
  expect(matrix?.shard).toEqual([1, 2, 3, 4]);

  // visual-merge dependencies
  expect(workflow.jobs["visual-merge"].needs).toBe("visual-shard");
});
