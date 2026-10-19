import { $ } from "bun";
import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { bigPageHtml } from "../conformance/perf/big-page.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

/** Fresh end-to-end conversions; the median rejects sustained regressions without a single runner scheduling spike. */
async function measuredConversion(html: string, options: Parameters<typeof convertHtml>[1]) {
  const samples: number[] = [];
  let result: Awaited<ReturnType<typeof convertHtml>> | undefined;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    result = await convertHtml(html, options);
    samples.push(performance.now() - start);
  }
  return { result: result!, convertMs: [...samples].sort((a, b) => a - b)[1]!, convertSamplesMs: samples };
}

nativeTest(
  "an 80-card product list converts, type-checks and builds within budget",
  async () => {
    const { result, convertMs, convertSamplesMs } = await measuredConversion(bigPageHtml(), { name: "BigList" });
    const dir = await mkdtemp(join(tmpdir(), "markswift-perf-"));
    try {
      for (const [file, content] of Object.entries({ ...result.files, ...result.assets }))
        await Bun.write(join(dir, file), content);
      const check = await typecheck(dir);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);

      const files = (await readdir(dir)).filter((f) => f.endsWith(".swift")).map((f) => join(dir, f));
      const b0 = performance.now();
      const build =
        await $`xcrun --sdk iphonesimulator swiftc -emit-library -Onone -parse-as-library -target arm64-apple-ios18.0-simulator -swift-version 6 -strict-concurrency=complete -default-isolation MainActor -module-name BigList ${files} -o ${join(dir, "libBigList.dylib")}`
          .nothrow()
          .quiet();
      const buildMs = performance.now() - b0;
      expect(build.exitCode).toBe(0);

      const code = result.files["BigList.swift"]!;
      const bytes = Buffer.byteLength(code);
      const images = Object.keys(result.assets).filter((p) => p.startsWith("Images/")).length;
      const compositingGroups = (code.match(/\.compositingGroup\(\)/g) ?? []).length;
      const hiddenOpacity = (code.match(/\.opacity\(0\.0\)/g) ?? []).length;
      // One line per run, so CI logs carry the trend.
      console.log(
        JSON.stringify({
          convertMs,
          convertSamplesMs,
          typecheckMs: check.ms,
          buildMs,
          bytes,
          images,
          compositingGroups,
          hiddenOpacity,
        }),
      );
      expect(convertMs).toBeLessThanOrEqual(5000);
      expect(check.ms).toBeLessThanOrEqual(8000);
      expect(buildMs).toBeLessThanOrEqual(20000);
      expect(bytes).toBeLessThanOrEqual(400 * 1024);
      expect(images).toBe(1);
      // Card (#fff / #27272a) and button (#2563eb) fills are opaque in both themes, every spread is 0.
      expect(compositingGroups).toBe(0);
      // The hover-only `.glow` overlay is invisible at rest and no pressed/focused state reveals it.
      expect(hiddenOpacity).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  180000,
);

nativeTest(
  "an 80-card product list with a 768px two-column breakpoint converts within its budget",
  async () => {
    // Adaptive: 2 bands × 2 themes.
    const { result, convertMs, convertSamplesMs } = await measuredConversion(bigPageHtml(), {
      name: "BigListBands",
      css: "main{width:auto!important} @media (min-width:768px){main{display:grid!important;grid-template-columns:1fr 1fr}}",
      breakpoints: {
        devices: [
          { width: 390, height: 844 },
          { width: 834, height: 1210 },
        ],
      },
    });
    const dir = await mkdtemp(join(tmpdir(), "markswift-perf-bands-"));
    try {
      for (const [file, content] of Object.entries({ ...result.files, ...result.assets }))
        await Bun.write(join(dir, file), content);
      const check = await typecheck(dir);
      if (!check.ok) throw new Error(check.output);
      const files = (await readdir(dir)).filter((f) => f.endsWith(".swift")).map((f) => join(dir, f));
      const b0 = performance.now();
      const build =
        await $`xcrun --sdk iphonesimulator swiftc -emit-library -Onone -parse-as-library -target arm64-apple-ios18.0-simulator -swift-version 6 -strict-concurrency=complete -default-isolation MainActor -module-name BigListBands ${files} -o ${join(dir, "libBigListBands.dylib")}`
          .nothrow()
          .quiet();
      const buildMs = performance.now() - b0;
      expect(build.exitCode).toBe(0);
      const code = result.files["BigListBands.swift"]!;
      const bytes = Buffer.byteLength(code);
      console.log(JSON.stringify({ convertMs, convertSamplesMs, typecheckMs: check.ms, buildMs, bytes }));
      expect(code).toContain("MarkswiftBands(");
      expect(convertMs).toBeLessThanOrEqual(12000);
      expect(check.ms).toBeLessThanOrEqual(12000);
      expect(buildMs).toBeLessThanOrEqual(30000);
      expect(bytes).toBeLessThanOrEqual(600 * 1024);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  180000,
);
