/** Runs the emitted descriptor expressions and actual table CoreText allocator on the host. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TableLayout } from "../../src/model/table.ts";
import { tableIntrinsicExpr } from "../../src/swift/table-intrinsic.ts";
import { TABLE_INTRINSIC_FONT_RUNTIME, TABLE_INTRINSIC_RUNTIME } from "../../src/swift/table-intrinsic-runtime.ts";

export async function nativeIntrinsicWidths(table: TableLayout, widths: number[]): Promise<{ maximums: number[]; widths: number[][] }> {
  const directory = await mkdtemp(join(tmpdir(), "markswift-intrinsic-table-"));
  try {
    const overhead = table.insets[1] + table.insets[3] + (table.columns.length - 1) * table.spacing[0];
    const source = `import Foundation\nimport CoreGraphics\nimport CoreText\n${TABLE_INTRINSIC_FONT_RUNTIME}\n${TABLE_INTRINSIC_RUNTIME}\n
let cells: [MarkswiftTableIntrinsic.Cell] = [${table.intrinsic!.map(tableIntrinsicExpr).join(", ")}]
let maximums = MarkswiftTableIntrinsic.maximums(cells, count: ${table.columns.length})
let allocated = [${widths.join(", ")}].map { width in MarkswiftTableIntrinsic.columns(maximums, available: CGFloat(width) - ${overhead}) }
let data = try JSONSerialization.data(withJSONObject: ["maximums": maximums, "widths": allocated])
print(String(data: data, encoding: .utf8)!)
`;
    await writeFile(join(directory, "proof.swift"), source);
    const compiler = Bun.spawn(["xcrun", "swiftc", join(directory, "proof.swift"), "-o", join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [error, status] = await Promise.all([new Response(compiler.stderr).text(), compiler.exited]);
    if (status !== 0) throw new Error(error);
    const executable = Bun.spawn([join(directory, "proof")], { stdout: "pipe", stderr: "pipe" });
    const [output, failure, exit] = await Promise.all([new Response(executable.stdout).text(), new Response(executable.stderr).text(), executable.exited]);
    if (exit !== 0) throw new Error(failure);
    return JSON.parse(output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
