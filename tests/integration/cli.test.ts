import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "CLI converts an HTML file and compiled CSS into a complete Swift bundle",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-cli-convert-"));
    try {
      const source = join(directory, "card.html");
      const css = join(directory, "card.css");
      const output = join(directory, "generated");
      await Bun.write(source, '<main data-markswift-root class="card">Hello CLI</main>');
      await Bun.write(css, "body{margin:0}.card{width:220px;height:80px;background:#ffcc00;font:18px system-ui}");
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "../../src/cli.ts"),
          "convert",
          source,
          "--css",
          css,
          "--name",
          "AlphaCard",
          "--out",
          output,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("AlphaCard");
      expect(await Bun.file(join(output, "AlphaCard.swift")).text()).toContain("Hello CLI");
      for (const file of ["MarkswiftRuntime.swift", "AlphaCard+Tokens.swift"]) {
        expect(await Bun.file(join(output, file)).exists()).toBe(true);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  45_000,
);

browserTest(
  "CLI accepts pasted HTML on stdin",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-cli-stdin-"));
    try {
      const output = join(directory, "generated");
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "../../src/cli.ts"),
          "convert",
          "-",
          "--name",
          "PastedCard",
          "--out",
          output,
        ],
        { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
      );
      child.stdin.write(
        '<main data-markswift-root style="width:120px;height:50px;font-family:system-ui">Pasted HTML</main>',
      );
      child.stdin.end();
      const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(await Bun.file(join(output, "PastedCard.swift")).text()).toContain("Pasted HTML");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  45_000,
);

browserTest(
  "CLI captures a running page URL and selected component",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-cli-url-"));
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          '<main><div id="card" style="width:150px;height:60px;font-family:system-ui">URL Card</div></main>',
          {
            headers: { "content-type": "text/html" },
          },
        ),
    });
    try {
      const output = join(directory, "generated");
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "../../src/cli.ts"),
          "convert",
          "--url",
          `http://127.0.0.1:${server.port}/`,
          "--root",
          "#card",
          "--name",
          "UrlCard",
          "--out",
          output,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(await Bun.file(join(output, "UrlCard.swift")).text()).toContain("URL Card");
    } finally {
      server.stop(true);
      await rm(directory, { recursive: true, force: true });
    }
  },
  45_000,
);
