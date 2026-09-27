import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { frameProbeCases, productionFrameProbeSwift } from "../helpers/fill-height-probe.ts";

const sdkTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
sdkTest("production frame modifiers respect actual finite and nil proposals while preserving minima and overflow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-fill-height-"));
  try {
    const cases = frameProbeCases(), reportPath = join(directory, "measurements.json"), overflowPath = join(directory, "overflow.png");
    const sourcePath = join(directory, "proof.swift"), executablePath = join(directory, "proof");
    await writeFile(sourcePath, productionFrameProbeSwift(cases, reportPath, overflowPath));
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-strict-concurrency=complete", "-warnings-as-errors", sourcePath, "-o", executablePath], { stdout: "pipe", stderr: "pipe" });
    const [diagnostics, compileExit] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    expect(compileExit, diagnostics).toBe(0); expect(diagnostics).toBe("");
    const probe = Bun.spawn([executablePath], { stdout: "pipe", stderr: "pipe" });
    const [error, exit] = await Promise.all([new Response(probe.stderr).text(), probe.exited]);
    expect(exit, error).toBe(0);
    const measurements = JSON.parse(await readFile(reportPath, "utf8")) as Array<{ id: string; phase: string; proposalHeight?: number; actualHeight: number }>;
    for (const c of cases) {
      const actual = measurements.filter(r => r.id === c.id && r.phase === "sizeThatFits" && (r.proposalHeight ?? null) === c.proposalHeight);
      expect(actual.length, c.id).toBeGreaterThan(0);
      expect(actual.every(r => r.actualHeight === c.expected), c.id + ": " + JSON.stringify(actual)).toBe(true);
    }
    const image = await sharp(overflowPath).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(128); expect(image.info.height).toBe(500);
    const pixel = (x: number, y: number) => [...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4)];
    expect(pixel(40, 20)).toEqual([0, 0, 0, 255]);
    expect(pixel(40, 400)).toEqual([0, 0, 0, 255]); // Actual child paint extends beyond the 380px fill box.
    expect(pixel(40, 450)).toEqual([255, 255, 255, 255]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
