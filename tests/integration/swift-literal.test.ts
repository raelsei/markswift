import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { str } from "../../src/swift/format.ts";

const nativeTest = (process.env.MARKSWIFT_SWIFT_TESTS ?? process.env.H2S_SWIFT_TESTS) === "1" ? test : test.skip;

nativeTest("emitted Swift literals preserve actual UTF16 units without evaluating interpolation", async () => {
  const values = [
    Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join(""),
    Array.from({ length: 33 }, (_, offset) => String.fromCharCode(0x7f + offset)).join(""),
    "\u2028\u2029", "\u00a0\u2003\u202f\ufeff", "é", "e\u0301", "🍭𐐀",
    'quote" slash\\ newline\n tab\t cr\r', '\\(fatalError("interpolation must stay literal"))',
  ];
  const directory = await mkdtemp(join(tmpdir(), "markswift-literal-roundtrip-"));
  try {
    const source = join(directory, "proof.swift"), executable = join(directory, "proof");
    await Bun.write(source, `import Foundation
let values: [String] = [${values.map(str).join(", ")}]
let units = values.map { Array($0.utf16).map(Int.init) }
let data = try JSONSerialization.data(withJSONObject: units)
print(String(decoding: data, as: UTF8.self))
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", "-swift-version", "6", "-warnings-as-errors", source, "-o", executable], { stdout: "pipe", stderr: "pipe" });
    const [compileOutput, compileError, compileExit] = await Promise.all([
      new Response(compiler.stdout).text(), new Response(compiler.stderr).text(), compiler.exited,
    ]);
    if (compileExit !== 0) throw new Error(compileOutput + compileError);
    expect(compileError).toBe("");
    const process = Bun.spawn([executable], { stdout: "pipe", stderr: "pipe" });
    const [output, error, exit] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
    ]);
    if (exit !== 0) throw new Error(error);
    // Swift String equality treats canonically equivalent spellings as equal; source units must be exact.
    expect(JSON.parse(output)).toEqual(values.map(value => Array.from({ length: value.length }, (_, index) => value.charCodeAt(index))));
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);
