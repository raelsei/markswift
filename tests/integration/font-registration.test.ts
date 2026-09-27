import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registrationSwift } from "../../src/fonts/registration.ts";

const nativeTest = (process.env.MARKSWIFT_SWIFT_TESTS ?? process.env.H2S_SWIFT_TESTS) === "1" ? test : test.skip;

nativeTest("font metadata line breaks and file controls cannot break emitted Swift registration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-registration-source-"));
  try {
    const source = join(directory, "FontRegistration.swift");
    await Bun.write(source, registrationSwift([{
      family: 'Web\r\n#error("source metadata escaped its comment")\u2028\u2029Font',
      file: 'file\0\v\f\u0085"\\(fatalError("literal interpolation"))🍭.ttf',
      style: "normal", weight: [400, 400], axes: {}, converted: false, renamed: false,
      metrics: { upem: 1000, ascent: 800, descent: 200, lineGap: 0, useTypoMetrics: false },
    }]));
    const compiler = Bun.spawn(["xcrun", "swiftc", "-typecheck", "-swift-version", "6", "-warnings-as-errors", source], { stdout: "pipe", stderr: "pipe" });
    const [output, error, exit] = await Promise.all([
      new Response(compiler.stdout).text(), new Response(compiler.stderr).text(), compiler.exited,
    ]);
    if (exit !== 0) throw new Error(output + error);
    expect(error).toBe("");
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);
