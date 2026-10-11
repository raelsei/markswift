import { $ } from "bun";
import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { bigPageHtml } from "../conformance/perf/big-page.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest(
  "an 80-card product list converts, type-checks and builds within budget",
  async () => {
    const t0 = performance.now();
    const result = await convertHtml(bigPageHtml(), { name: "BigList" });
    const convertMs = performance.now() - t0;
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
        JSON.stringify({ convertMs, typecheckMs: check.ms, buildMs, bytes, images, compositingGroups, hiddenOpacity }),
      );
      expect(convertMs).toBeLessThanOrEqual(5000);
      expect(check.ms).toBeLessThanOrEqual(8000);
      expect(buildMs).toBeLessThanOrEqual(20000);
      expect(bytes).toBeLessThanOrEqual(400 * 1024);
      expect(images).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  180000,
);
