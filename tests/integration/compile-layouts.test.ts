import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { compileLayouts } from "../../src/index.ts";
import type { LayoutDoc } from "../../src/compiler/index.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const layout: LayoutDoc = {
  version: 1, source: "card.html", combo: { screen: "card", theme: "light", demoState: "normal" },
  size: { w: 120, h: 40 }, dpr: 1, canvas: "white", fonts: [],
  root: { id: "root", tag: "main", attrs: {}, styles: { display: "block", "background-color": "rgb(255, 0, 0)" }, bounds: { x: 0, y: 0, w: 120, h: 40 }, children: [] },
};

function svgLayout(path: string): LayoutDoc {
  return {
    ...layout,
    root: {
      id: "root", tag: "svg", attrs: { viewbox: "0 0 120 40" }, styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 120, h: 40 },
      children: [{ tag: "path", attrs: { d: path, fill: "red" }, styles: {}, bounds: { x: 0, y: 0, w: 120, h: 40 }, children: [] }],
    },
  };
}

test("public Bun API and bundled Node compiler both expose multi-layout compilation", async () => {
  expect(compileLayouts([{ layout, name: "BunView" }]).files["BunView.swift"]).toContain("struct BunView: View");
  const directory = await mkdtemp(join(tmpdir(), "markswift-compile-layouts-node-"));
  try {
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../../src/compiler/index.ts")], target: "node", format: "esm", outdir: directory });
    expect(built.success, built.logs.join("\n")).toBe(true);
    const entry = basename(built.outputs[0]!.path);
    await writeFile(join(directory, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(join(directory, "consumer.mjs"), `import { compileLayouts } from "./${entry}";\nconst bundle = compileLayouts([{ layout: ${JSON.stringify(layout)}, name: "NodeView" }]);\nif (!bundle.files["NodeView.swift"]?.includes("struct NodeView: View")) process.exit(1);\n`);
    const process = Bun.spawn(["node", "consumer.mjs"], { cwd: directory, stdout: "pipe", stderr: "pipe" });
    const [stderr, exit] = await Promise.all([new Response(process.stderr).text(), process.exited]);
    expect(exit, stderr).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("two generated views and one shared helper set typecheck in one iOS target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-compile-layouts-swift-"));
  try {
    const bundle = compileLayouts([
      { layout: svgLayout("M 0 0 L 50 0 L 50 40 Z"), name: "AlphaView" },
      { layout: svgLayout("M 0 0 L 90 0 L 90 40 Z"), name: "BetaView" },
    ]);
    expect([...bundle.files["MarkswiftShapes.swift"]!.matchAll(/nonisolated struct MarkswiftShape_/g)]).toHaveLength(2);
    for (const [name, source] of Object.entries(bundle.files)) await writeFile(join(directory, name), source);
    const check = await typecheck(directory);
    expect(check.ok, check.output).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
