import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

async function run(command: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("packed compiler imports and compiles in a Node consumer with declarations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-node-consumer-"));
  try {
    const packed = await run(["bun", "pm", "pack", "--destination", directory, "--quiet"], repo);
    expect(packed.exitCode, packed.stderr).toBe(0);
    const archive = join(directory, (await readdir(directory)).find(file => file.endsWith(".tgz"))!);

    await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
    const installed = await run(["bun", "add", "--offline", archive], directory);
    expect(installed.exitCode, installed.stderr).toBe(0);
    const help = await run([join(directory, "node_modules", ".bin", "markswift"), "--help"], directory);
    expect(help.exitCode, help.stderr).toBe(0);
    expect(help.stdout).toContain("markswift convert");
    const nodeTypes = await run(["bun", "add", "--offline", "-d", "@types/node@26.5.0"], directory);
    expect(nodeTypes.exitCode, nodeTypes.stderr).toBe(0);

    const layoutSource = `{
  version: 1, source: "component.html", combo: { screen: "card", theme: "light", demoState: "normal" },
  size: { w: 200, h: 80 }, dpr: 1, canvas: "rgb(255, 255, 255)", fonts: [],
  root: { id: "root", tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 200, h: 80 }, children: [] },
}`;
    const consumer = `import { compileLayout } from "markswift/compiler";
import { convertHtml } from "markswift";
const layout = ${layoutSource};
const result = compileLayout(layout, { name: "CardView" });
if (!result.code.includes("struct CardView: View") || Object.keys(result.files).length !== 4) throw new Error("invalid Swift output");
if (typeof convertHtml !== "function") throw new Error("Node root export is missing");
`;
    await writeFile(join(directory, "consumer.mjs"), consumer);
    const node = await run(["node", "consumer.mjs"], directory);
    expect(node.exitCode, node.stderr).toBe(0);

    await writeFile(join(directory, "consumer.ts"), `import { compileLayout, type LayoutDoc } from "markswift/compiler";\nimport { convertHtml, type ConvertOptions } from "markswift";\nconst layout: LayoutDoc = ${layoutSource};\nconst result: string = compileLayout(layout).code;\nvoid result;\nconst options: ConvertOptions = { name: "CardView" };\nvoid convertHtml("<main>Hi</main>", options);\n// @ts-expect-error Swift type names must be strings\ncompileLayout(layout, { name: 42 });\n// @ts-expect-error LayoutDoc version must be numeric\nconst invalid: LayoutDoc = { ...layout, version: "broken" };\nvoid invalid;\n`);
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      strict: true, target: "ES2022", lib: ["ES2022", "DOM", "ESNext.Disposable"], types: ["node"],
      module: "NodeNext", moduleResolution: "NodeNext", noEmit: true,
    }, include: ["consumer.ts"] }));
    const typecheck = await run([join(repo, "node_modules", ".bin", "tsc"), "-p", "tsconfig.json"], directory);
    expect(typecheck.exitCode, typecheck.stderr || typecheck.stdout).toBe(0);

    const manifest = JSON.parse(await readFile(join(directory, "node_modules", "markswift", "package.json"), "utf8"));
    expect(manifest.exports["./compiler"].types).toEndWith(".d.ts");
    expect(manifest.exports["."].types).toEndWith(".d.ts");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);

async function installGitConsumer(directory: string): Promise<string> {
  const source = join(directory, "source");
  const consumer = join(directory, "consumer");
  await mkdir(source);
  await mkdir(consumer);
  await cp(join(repo, "src"), join(source, "src"), { recursive: true });
  await cp(join(repo, "dist"), join(source, "dist"), { recursive: true });
  for (const file of ["package.json", "bun.lock", "tsconfig.json", "tsconfig.build.json", ".gitignore"]) {
    await cp(join(repo, file), join(source, file));
  }
  for (const command of [
    ["git", "init", "--quiet"],
    ["git", "config", "user.email", "test@example.invalid"],
    ["git", "config", "user.name", "Test"],
    ["git", "add", "."],
    ["git", "commit", "-qm", "snapshot"],
  ]) {
    const result = await run(command, source);
    expect(result.exitCode, result.stderr).toBe(0);
  }
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const installed = await run(["bun", "add", `git+file://${source}`], consumer);
  expect(installed.exitCode, installed.stderr).toBe(0);
  const packageDir = join(consumer, "node_modules", "markswift");
  for (const path of ["dist/compiler.js", "dist/index.js", "dist/cli.js", "dist/types/compiler/index.d.ts", "dist/types/index.d.ts"]) {
    expect((await readFile(join(packageDir, path))).length).toBeGreaterThan(0);
  }
  return consumer;
}

test("plain Git install exposes committed Node compiler and root API without lifecycle scripts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-git-consumer-"));
  try {
    const consumer = await installGitConsumer(directory);
    const node = await run(["node", "--input-type=module", "-e", 'import { compileLayout } from "markswift/compiler"; import { convertHtml } from "markswift"; if (typeof compileLayout !== "function" || typeof convertHtml !== "function") process.exit(1)'], consumer);
    expect(node.exitCode, node.stderr).toBe(0);
    const bun = await run(["bun", "-e", 'import { convertHtml } from "markswift"; if (typeof convertHtml !== "function") process.exit(1)'], consumer);
    expect(bun.exitCode, bun.stderr).toBe(0);
    const help = await run([join(consumer, "node_modules", ".bin", "markswift"), "--help"], consumer);
    expect(help.exitCode, help.stderr).toBe(0);
    expect(help.stdout).toContain("markswift convert");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);

browserTest("Git-installed root API converts HTML in Node and Bun", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-git-browser-"));
  try {
    const consumer = await installGitConsumer(directory);
    await writeFile(join(consumer, "convert.mjs"), `import { convertHtml } from "markswift";
const result = await convertHtml('<main data-markswift-root style="width:120px;height:40px">Installed API</main>', { name: "InstalledView" });
if (!result.code.includes("struct InstalledView: View") || !result.code.includes("Installed API") || result.layout.size.w !== 120) process.exit(1);
`);
    for (const runtime of ["node", "bun"]) {
      const result = await run([runtime, "convert.mjs"], consumer);
      expect(result.exitCode, result.stderr).toBe(0);
    }
    await writeFile(join(consumer, "input.html"), '<main data-markswift-root style="width:120px;height:40px">Installed CLI</main>');
    const cli = await run([join(consumer, "node_modules", ".bin", "markswift"), "convert", "input.html", "--out", "generated-cli", "--name", "CliView"], consumer);
    expect(cli.exitCode, cli.stderr).toBe(0);
    expect(cli.stdout).toContain("Node mapping:");
    expect(await readFile(join(consumer, "generated-cli", "CliView.swift"), "utf8")).toContain("Installed CLI");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
