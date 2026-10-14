import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inlineRelativeUrls } from "../../../src/cli/css.ts";
import { writeBundle } from "../../../src/cli/output.ts";
import { VERSION } from "../../../src/model/version.ts";

const entry = join(import.meta.dir, "../../../src/cli.ts");

async function invoke(...args: string[]) {
  const child = Bun.spawn([process.execPath, entry, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
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

test("CLI reports the package version", async () => {
  const result = await invoke("--version");
  expect(result).toEqual({ stdout: `${VERSION}\n`, stderr: "", code: 0 });
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
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("--force without --update is a usage error", async () => {
  const result = await invoke("convert", "card.html", "--out", "generated", "--force");
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("--force only applies with --update");
});

test("--update refuses a directory Markswift did not write before Chrome starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-cli-foreign-"));
  try {
    const source = join(directory, "card.html");
    const output = join(directory, "generated");
    await Bun.write(source, "<main>Card</main>");
    await Bun.write(join(output, "keep.txt"), "keep me");
    const result = await invoke("convert", source, "--out", output, "--update");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("has no .markswift.json");
    expect(await Bun.file(join(output, "keep.txt")).text()).toBe("keep me");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("--update refuses hand-edited files with exit 2 before Chrome starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-cli-edited-"));
  try {
    const source = join(directory, "card.html");
    const output = join(directory, "generated");
    await Bun.write(source, "<main>Card</main>");
    await writeBundle({ files: { "Card.swift": "x" }, assets: {} }, output, { version: "0" });
    await Bun.write(join(output, "Card.swift"), "x // mine");
    const result = await invoke("convert", source, "--out", output, "--update");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Card.swift");
    expect(await Bun.file(join(output, "Card.swift")).text()).toBe("x // mine");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI help documents --update and --force", async () => {
  const result = await invoke("convert", "--help");
  expect(result.stdout).toContain("--update");
  expect(result.stdout).toContain("--force");
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
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid Swift names are usage errors before Chrome starts", async () => {
  const result = await invoke("convert", "card.html", "--name", "bad name", "--out", "generated");
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("Swift type identifier");
  expect(result.stderr).toContain("markswift convert --help");
});

test("CLI theme defaults to adaptive and passes the dark class through", async () => {
  const { parseArgs } = await import("../../../src/cli/args.ts");
  const parsed = (...args: string[]) => {
    const command = parseArgs(["convert", "card.html", "--out", "generated", ...args]);
    if (command.kind !== "convert") throw new Error("expected a conversion");
    return command.options;
  };
  expect(parsed().theme).toBe("adaptive");
  expect(parsed("--theme", "light").theme).toBe("light");
  expect(parsed("--dark-class", "dark").darkClass).toBe("dark");
  const result = await invoke("convert", "card.html", "--theme", "both", "--out", "generated");
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("--theme must be adaptive, light or dark");
});

test("--css url()s relative to the CSS file are inlined as data URLs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-cli-css-"));
  try {
    await Bun.write(join(directory, "dist/fonts/x.woff2"), "wOF2");
    await Bun.write(join(directory, "dist/img/bg.png"), "png");
    const kept = ["url(data:image/png;base64,AA)", "url(https://cdn/x.png)", "url(/abs.png)", "url(missing.png)"];
    const { css, missing } = await inlineRelativeUrls(
      `a{src:url(./fonts/x.woff2)}b{background:url("img/bg.png")}${kept.join(" ")}`,
      join(directory, "dist/app.css"),
    );
    expect(css).toContain(`url("data:font/woff2;base64,${btoa("wOF2")}")`);
    expect(css).toContain(`url("data:image/png;base64,${btoa("png")}")`);
    for (const k of kept) expect(css).toContain(k);
    expect(missing).toEqual(["missing.png"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
