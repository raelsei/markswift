import { expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join, resolve } from "node:path";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const repo = resolve(import.meta.dir, "../..");

browserTest("a Node bundle converts HTML through Chromium", async () => {
  const out = join(repo, "out");
  await mkdir(out, { recursive: true });
  const entry = join(out, `node-convert-${randomUUID()}.mjs`);
  const consumer = join(out, `node-consumer-${randomUUID()}.mjs`);
  try {
    const build = Bun.spawn(["bun", "build", "./src/index.ts", "--target=node", "--format=esm", `--outfile=${entry}`, "--external", "playwright-core"], {
      cwd: repo, stdout: "pipe", stderr: "pipe",
    });
    const [buildErrors, buildCode] = await Promise.all([new Response(build.stderr).text(), build.exited]);
    expect(buildCode, buildErrors).toBe(0);
    await writeFile(consumer, `import { convertHtml } from "./${basename(entry)}";
const result = await convertHtml('<main data-markswift-root style="width:120px;height:40px">Node works</main>', { name: "NodeView" });
if (!result.code.includes("struct NodeView: View") || !result.code.includes("Node works") || result.layout.size.w !== 120) process.exit(1);
const font = await convertHtml('<main data-markswift-root style="width:120px;height:40px">Node font</main>', { name: "NodeFont", css: '@font-face{font-family:Broken;src:url(data:font/woff2;base64,d09GMmludmFsaWQtZm9udA==) format("woff2")}main{font-family:Broken}' });
if (!font.warnings.some(note => note.includes("Broken could not be packaged"))) process.exit(1);
`);
    const node = Bun.spawn(["node", consumer], { cwd: repo, stdout: "pipe", stderr: "pipe" });
    const [error, code] = await Promise.all([new Response(node.stderr).text(), node.exited]);
    expect(code, error).toBe(0);
  } finally {
    await Promise.all([rm(entry, { force: true }), rm(consumer, { force: true })]);
  }
}, 60000);
