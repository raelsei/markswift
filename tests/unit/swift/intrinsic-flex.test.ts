import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALLOCATION_CORE } from "../../../src/swift/allocation-runtime.ts";
import { INTRINSIC_FLEX_CORE } from "../../../src/swift/intrinsic-flex-runtime.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

nativeTest("native line collection happens before shrink and preserves auto minima and shrink zero", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-intrinsic-rows-"));
  try {
    await Bun.write(join(directory, "proof.swift"), `import Foundation\n${ALLOCATION_CORE}\n${INTRINSIC_FLEX_CORE}
let tracks = [MarkswiftAllocationTrack(basis: 120, grow: 0, shrink: 1, min: 40, inset: 20),
              MarkswiftAllocationTrack(basis: 100, grow: 0, shrink: 1, min: 50, inset: 10)]
let wrapped = MarkswiftIntrinsicFlexGeometry.rows(width: 200, tracks: tracks, gap: 8, wrapping: true)
precondition(wrapped.map { $0.indices } == [[0], [1]])
precondition(wrapped.map { $0.widths } == [[120], [100]])
let compressed = MarkswiftIntrinsicFlexGeometry.rows(width: 140, tracks: tracks, gap: 8, wrapping: false)
precondition(abs(compressed[0].widths.reduce(0, +) - 132) < 0.001)
precondition(abs((120 - compressed[0].widths[0]) / (100 - compressed[0].widths[1]) - 100.0 / 90.0) < 0.001)
let overflowing = MarkswiftIntrinsicFlexGeometry.rows(width: 50, tracks: tracks, gap: 8, wrapping: false)
precondition(overflowing[0].widths == [40, 50])
let singleton = MarkswiftIntrinsicFlexGeometry.rows(width: 80, tracks: [tracks[0]], gap: 8, wrapping: true)
precondition(singleton[0].widths == [80])
let unbreakable = MarkswiftIntrinsicFlexGeometry.rows(width: 30, tracks: [tracks[0]], gap: 8, wrapping: true)
precondition(unbreakable[0].widths == [40])
var frozen = tracks[0]; frozen.shrink = 0
precondition(MarkswiftIntrinsicFlexGeometry.rows(width: 80, tracks: [frozen], gap: 8, wrapping: true)[0].widths == [120])
print("line collection, shrink weights, auto minima and frozen singleton passed")
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stderr: "pipe" });
    const [error, exit] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(exit, error).toBe(0); expect(error).not.toContain("warning:");
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, runError, code] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    expect(code, runError).toBe(0); expect(output).toContain("frozen singleton passed");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);
