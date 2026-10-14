import { expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

async function build(config: string, ...flags: string[]) {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "../../src/cli.ts"), "build", config, ...flags], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

/** Every file under `dir`, relative path → bytes as base64. */
async function tree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }))
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      out[relative(dir, path)] = (await readFile(path)).toString("base64");
    }
  return out;
}

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 4h16v16H4z" fill="currentColor"/></svg>';
const STYLE =
  "<style>:root{--primary:#2563eb} @media (prefers-color-scheme: dark){:root{--primary:#60a5fa}} body{margin:0} main{width:240px;font:16px system-ui} .p{background:var(--primary);color:white;padding:8px}</style>";
const COMPONENTS: Record<string, string> = {
  Badge: `<p class="p">${ICON} New</p>`,
  Banner: `<div class="p">${ICON} Welcome back</div><div class="p">Two</div>`,
  Tile: `<section class="p">${ICON} Tile</section>`,
};

browserTest(
  "markswift build writes one package and regenerates only the files it owns",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "markswift-build-"));
    try {
      for (const [name, body] of Object.entries(COMPONENTS))
        await writeFile(
          join(dir, `${name}.html`),
          `<!doctype html><html><head>${STYLE}</head><body><main data-markswift-root>${body}</main></body></html>`,
        );
      const config = async (file: string, out: string, names = Object.keys(COMPONENTS)) => {
        const path = join(dir, file);
        await writeFile(
          path,
          JSON.stringify({ library: "Kit", out, components: names.map((name) => ({ name, source: `${name}.html` })) }),
        );
        return path;
      };
      const cfg = await config("markswift.json", "Kit");
      const pkg = join(dir, "Kit");

      // 1. One package: one runtime, the tools-version line first, a manifest listing every file.
      const first = await build(cfg);
      expect(first.stderr).not.toContain("Error");
      expect(first.code).toBe(0);
      expect(first.stdout).toContain("for Kit (3 components)");
      const files = await tree(pkg);
      expect(Object.keys(files).filter((f) => f.endsWith("MarkswiftRuntime.swift"))).toEqual([
        "Sources/Kit/MarkswiftRuntime.swift",
      ]);
      const manifest = Buffer.from(files["Package.swift"]!, "base64").toString().split("\n");
      expect(manifest[0]).toBe("// swift-tools-version: 6.2");
      expect(manifest[1]).toContain("tool-owned: regenerate with `markswift build`");
      const listed = JSON.parse(Buffer.from(files[".markswift.json"]!, "base64").toString()).files;
      expect(Object.keys(listed).sort()).toEqual(
        Object.keys(files)
          .filter((f) => f !== ".markswift.json")
          .sort(),
      );
      for (const name of Object.keys(COMPONENTS)) expect(files[`Sources/Kit/${name}.swift`]).toBeDefined();
      expect(
        Buffer.from(files["Sources/Kit/MarkswiftShapes.swift"]!, "base64")
          .toString()
          .match(/^nonisolated struct /gm),
      ).toHaveLength(1);

      // 2. Rebuilding is byte-identical, in place and into a fresh directory.
      expect((await build(cfg)).code).toBe(0);
      expect(await tree(pkg)).toEqual(files);
      expect((await build(await config("fresh.json", "Fresh"))).code).toBe(0);
      expect(await tree(join(dir, "Fresh"))).toEqual(files);

      // 6. A developer's own file in the package survives regeneration.
      const extra = join(pkg, "Sources/Kit/Extra.swift");
      await writeFile(extra, "// mine\n");

      // 3. A component removed from the config loses its view; the others remain.
      expect((await build(await config("markswift.json", "Kit", ["Badge", "Banner"]))).code).toBe(0);
      const fewer = await tree(pkg);
      expect(fewer["Sources/Kit/Tile.swift"]).toBeUndefined();
      expect(fewer["Sources/Kit/Badge.swift"]).toBeDefined();
      expect(fewer["Sources/Kit/Extra.swift"]).toBeDefined();

      // 4. A hand-edited generated view stops the build (exit 2) until --force.
      const badge = join(pkg, "Sources/Kit/Badge.swift");
      await appendFile(badge, "// edited\n");
      const edited = await readFile(badge, "utf8");
      const refused = await build(cfg);
      expect(refused.code).toBe(2);
      expect(refused.stderr).toContain("Badge.swift");
      expect(await readFile(badge, "utf8")).toBe(edited);
      expect((await build(cfg, "--force")).code).toBe(0);
      expect(await readFile(badge, "utf8")).not.toContain("// edited");
      expect(await readFile(extra, "utf8")).toBe("// mine\n");

      // 5. An existing directory Markswift did not write is refused and left untouched.
      const foreign = join(dir, "Foreign");
      await mkdir(foreign);
      await writeFile(join(foreign, "keep.txt"), "x");
      const refusedForeign = await build(await config("foreign.json", "Foreign"));
      expect(refusedForeign.code).toBe(1);
      expect(await tree(foreign)).toEqual({ "keep.txt": Buffer.from("x").toString("base64") });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  240000,
);
