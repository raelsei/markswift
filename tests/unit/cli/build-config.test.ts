import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageError } from "../../../src/cli/args.ts";
import { loadBuildConfig } from "../../../src/cli/config.ts";

const entry = join(import.meta.dir, "../../../src/cli.ts");
const dir = await mkdtemp(join(tmpdir(), "markswift-build-config-"));
afterAll(() => rm(dir, { recursive: true, force: true }));
await writeFile(join(dir, "card.html"), "<main data-markswift-root>Hi</main>");
await writeFile(join(dir, "card.css"), "main{background:url(missing.png)}");

async function config(name: string, value: unknown) {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

async function build(...args: string[]) {
  const child = Bun.spawn([process.execPath, entry, "build", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

const valid = { library: "Kit", out: "out", components: [{ name: "Card", source: "card.html" }] };

test("config mistakes exit 2 naming the problem", async () => {
  const unknown = await build(await config("unknown.json", { ...valid, colour: "red" }));
  expect(unknown.code).toBe(2);
  expect(unknown.stderr).toContain("colour");
  const { out: _, ...noOut } = valid;
  const missing = await build(await config("no-out.json", noOut));
  expect(missing.code).toBe(2);
  expect(missing.stderr).toContain("out");
  const duplicate = await build(
    await config("duplicate.json", {
      ...valid,
      components: [
        { name: "Card", source: "card.html" },
        { name: "CARD", source: "card.html" },
      ],
    }),
  );
  expect(duplicate.code).toBe(2);
  expect(duplicate.stderr).toContain("duplicate");
  expect((await build("card.json", "--unknown")).code).toBe(2);
});

test("a source outside serve exits 1 naming the component, before any capture", async () => {
  const outside = await build(
    await config("outside.json", { ...valid, serve: "assets", components: [{ name: "Card", source: "card.html" }] }),
  );
  expect(outside.code).toBe(1);
  expect(outside.stderr).toContain("Card");
  expect(outside.stderr).toContain("outside serveRoot");
  expect((await build(join(dir, "nonexistent.json"))).code).toBe(1);
});

test("build --help exits 0 and documents the command", async () => {
  const help = await build("--help");
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("markswift build [markswift.json] [--force]");
});

test("paths resolve against the config, and component fields override top-level defaults", async () => {
  const loaded = await loadBuildConfig(
    await config("override.json", {
      ...valid,
      theme: "light",
      mode: "fidelity",
      css: "card.css",
      components: [
        { name: "Card", source: "card.html", theme: "dark" },
        { name: "Remote", source: "https://example.com/x.html" },
      ],
    }),
  );
  expect(loaded.out).toBe(join(dir, "out"));
  expect(loaded.options.serveRoot).toBe(dir);
  const [card, remote] = loaded.options.components;
  expect(card).toMatchObject({
    name: "Card",
    source: { file: join(dir, "card.html") },
    theme: "dark",
    mode: "fidelity",
  });
  expect(remote).toMatchObject({ source: { url: "https://example.com/x.html" }, theme: "light" });
  expect(card!.css).toContain("missing.png");
  expect(loaded.warnings).toEqual([
    { source: "build", message: `--css reference not found next to ${join(dir, "card.css")}: missing.png` },
  ]);
  await expect(loadBuildConfig(await config("bad-name.json", { ...valid, library: "kit" }))).rejects.toBeInstanceOf(
    UsageError,
  );
});
