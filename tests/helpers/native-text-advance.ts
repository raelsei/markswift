/** Executes the emitted word-advance helper with the same named native font descriptor. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FontSpec } from "../../src/model/semantic.ts";
import { nativeTextWeight } from "../../src/swift/text-line-box.ts";
import { TEXT_ADVANCE_RUNTIME } from "../../src/swift/text-advance-runtime.ts";

export async function nativeTextAdvances(text: string, font: FontSpec): Promise<{ widths: number[]; space: number; whole: number }> {
  const directory = await mkdtemp(join(tmpdir(), "markswift-text-advance-"));
  try {
    const words = text.split(" ");
    await Bun.write(join(directory, "proof.swift"), `import Foundation\nimport CoreText\n${TEXT_ADVANCE_RUNTIME}\n
let font = MarkswiftTextAdvance.NativeFont.systemFont(ofSize: ${font.size}, weight: .${nativeTextWeight(font)})
let words: [String] = ${JSON.stringify(words)}
let widths = words.map { MarkswiftTextAdvance.width($0, font: font) }
let data = try JSONSerialization.data(withJSONObject: ["widths": widths, "space": MarkswiftTextAdvance.width(" ", font: font), "whole": MarkswiftTextAdvance.width(${JSON.stringify(text)}, font: font)])
print(String(data: data, encoding: .utf8)!)
`);
    const compiler = Bun.spawn(["xcrun", "swiftc", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [error, status] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    if (status !== 0) throw new Error(error);
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, failure, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    if (exit !== 0) throw new Error(failure);
    return JSON.parse(output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
