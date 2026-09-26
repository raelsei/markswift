import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, UsageError } from "../../../src/cli/args.ts";

const entry = join(import.meta.dir, "../../../src/cli.ts");

async function invoke(...args: string[]) {
  const child = Bun.spawn([process.execPath, entry, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { stdout, stderr, code };
}

test("CLI help explains input, output and browser requirements without starting conversion", async () => {
  for (const args of [["--help"], ["convert", "--help"]]) {
    const result = await invoke(...args);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("markswift convert");
    expect(result.stdout).toContain("--out");
    expect(result.stdout).toContain("Chrome");
    expect(result.stderr).toBe("");
  }
});

test("CLI reports the alpha package version", async () => {
  const result = await invoke("--version");
  expect(result).toEqual({ stdout: "0.1.0-alpha.1\n", stderr: "", code: 0 });
});

test("CLI rejects missing and ambiguous input with usage status", async () => {
  for (const args of [
    ["convert", "--out", "generated"],
    ["convert", "card.html", "--url", "https://example.com", "--out", "generated"],
    ["convert", "card.html", "--unknown", "x", "--out", "generated"],
  ]) {
    const result = await invoke(...args);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("markswift convert --help");
    expect(result.stdout).toBe("");
  }
});

test("CLI rejects non-HTTP URLs before starting conversion", async () => {
  for (const url of ["file:///tmp/card.html", "not-a-url"]) {
    const result = await invoke("convert", "--url", url, "--out", "generated");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("HTTP or HTTPS URL");
  }
});

test("CLI leaves an existing output directory untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-cli-existing-"));
  try {
    const source = join(directory, "card.html");
    const output = join(directory, "generated");
    await Bun.write(source, "<main>Card</main>");
    await Bun.write(join(output, "keep.txt"), "keep me");
    const result = await invoke("convert", source, "--out", output);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("already exists");
    expect(await Bun.file(join(output, "keep.txt")).text()).toBe("keep me");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("CLI explains missing input files before starting Chrome", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-cli-missing-"));
  try {
    const html = join(directory, "card.html");
    const css = join(directory, "card.css");
    const output = join(directory, "generated");
    const missingHtml = await invoke("convert", html, "--out", output);
    expect(missingHtml.code).toBe(1);
    expect(missingHtml.stderr).toContain(`HTML file not found: ${html}`);

    await Bun.write(html, "<main>Card</main>");
    const missingCss = await invoke("convert", html, "--css", css, "--out", output);
    expect(missingCss.code).toBe(1);
    expect(missingCss.stderr).toContain(`CSS file not found: ${css}`);
    expect(missingCss.stderr).toContain("--css is optional");
    expect(await Bun.file(join(output, "CardView.swift")).exists()).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("invalid Swift names are usage errors before Chrome starts", async () => {
  const result = await invoke("convert", "card.html", "--name", "bad name", "--out", "generated");
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("Swift type identifier");
  expect(result.stderr).toContain("markswift convert --help");
});

test("responsive CLI options require a valid compact-to-regular breakpoint", () => {
  const base = ["convert", "page.html", "--out", "generated"];
  const command = parseArgs([...base, "--compact-width", "320", "--breakpoint", "350", "--width", "390"]);
  expect(command.kind).toBe("convert");
  if (command.kind !== "convert") throw new Error("Expected conversion command");
  expect(command.responsive).toEqual({ compactWidth: 320, breakpoint: 350 });
  for (const extra of [
    ["--compact-width", "320"],
    ["--breakpoint", "350"],
    ["--compact-width", "350", "--breakpoint", "350", "--width", "350"],
    ["--compact-width", "321", "--breakpoint", "320"],
    ["--compact-width", "0", "--breakpoint", "350"],
    ["--compact-width", "320", "--breakpoint", "3.5"],
  ]) expect(() => parseArgs([...base, ...extra])).toThrow(UsageError);
});
