import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageError } from "../../../src/cli/args.ts";
import { loadBuildConfig, loadPalette } from "../../../src/cli/config.ts";

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

test("palette maps: bad keys and multi-line values are usage errors naming the key; a valid map round-trips", async () => {
  const map = { "--primary": "Color.accentColor", "#E2E8F0": 'Color("Card")', "#ffffff/#0a0f14cc": "Color.red" };
  expect(await loadPalette(await config("palette.json", map))).toEqual(map);
  const badKey = loadPalette(await config("bad-key.json", { primary: "Color.red" }));
  await expect(badKey).rejects.toBeInstanceOf(UsageError);
  await expect(badKey).rejects.toThrow(/primary: key must be --name/);
  const multiLine = loadPalette(await config("multi-line.json", { "--primary": "Color.red\n.opacity(0.5)" }));
  await expect(multiLine).rejects.toBeInstanceOf(UsageError);
  await expect(multiLine).rejects.toThrow(/--primary: value must be a single-line Swift expression/);
  await expect(loadPalette(join(dir, "absent.json"))).rejects.toThrow("palette map not found");
  const loaded = await loadBuildConfig(await config("with-palette.json", { ...valid, palette: "palette.json" }));
  expect(loaded.options.palette).toEqual(map);
});

test("breakpoints: a shared value is inherited, a component's false turns it off, a bad max names the key", async () => {
  const loaded = await loadBuildConfig(
    await config("breakpoints.json", {
      ...valid,
      breakpoints: true,
      components: [
        { name: "Card", source: "card.html" },
        { name: "Plain", source: "card.html", breakpoints: false },
        { name: "Wide", source: "card.html", breakpoints: { max: 1024 } },
      ],
    }),
  );
  expect(loaded.options.components.map((c) => c.breakpoints)).toEqual([true, undefined, { max: 1024 }]);
  const bad = loadBuildConfig(await config("bad-breakpoints.json", { ...valid, breakpoints: { max: 100 } }));
  await expect(bad).rejects.toBeInstanceOf(UsageError);
  await expect(bad).rejects.toThrow("breakpoints");
});
