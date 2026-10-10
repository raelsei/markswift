import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("a missing python3 leaves the face unbundled with a note and writes no font file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-fonts-"));
  try {
    // Bun.spawn resolves executables from the spawn environment, so PATH is cut in a child Bun.
    const script = `import { packageFonts } from ${JSON.stringify(resolve(import.meta.dir, "../../../src/fonts/package.ts"))};
import { readdir } from "node:fs/promises";
const out = process.argv[1];
const pkg = await packageFonts([{ family: "Probe", style: "normal", weight: [400, 400], loaded: true,
  src: [{ url: "data:font/ttf;base64,AAEAAAAA" }] }], out, out);
console.log(JSON.stringify({ notes: pkg.notes, faces: pkg.faces.length, files: await readdir(out + "/Fonts") }));`;
    const child = Bun.spawn([process.execPath, "-e", script, dir], { env: { PATH: "/nonexistent" }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(err).toBe("");
    expect(code).toBe(0);
    const result = JSON.parse(out) as { notes: string[]; faces: number; files: string[] };
    expect(result.faces).toBe(0);
    expect(result.files).toEqual([]);
    expect(result.notes.filter((n) => n.includes("not bundled") && n.includes("python3 not found"))).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
