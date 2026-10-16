import { expect, test } from "bun:test";
import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

browserTest(
  "CLI --update regenerates in place behind an edit guard",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-cli-update-"));
    try {
      const source = join(directory, "card.html");
      const css = join(directory, "card.css");
      const output = join(directory, "generated");
      const view = join(output, "AlphaCard.swift");
      const wrapper = join(output, "Wrapper.swift");
      await Bun.write(source, '<main data-markswift-root class="card">Hello CLI</main>');
      await Bun.write(css, "body{margin:0}.card{width:220px;height:80px;background:#ffcc00;font:18px system-ui}");
      const run = async (...flags: string[]) => {
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
            ...flags,
          ],
          { stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        return { stdout, stderr, code };
      };
      const snapshot = async () => {
        const names = (await readdir(output, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => join(entry.parentPath, entry.name));
        return Object.fromEntries(
          await Promise.all(names.sort().map(async (name) => [name, (await readFile(name)).toString("hex")])),
        );
      };

      expect((await run()).code).toBe(0);
      const first = await snapshot();
      expect(Object.keys(first)).toContain(join(output, ".markswift.json"));
      await writeFile(wrapper, "struct Wrapper {}");

      const updated = await run("--update");
      expect(updated.code).toBe(0);
      expect(updated.stdout).toContain("Updated");
      expect(await snapshot()).toEqual({ ...first, [wrapper]: Buffer.from("struct Wrapper {}").toString("hex") });

      await appendFile(view, "\n// mine");
      const refused = await run("--update");
      expect(refused.code).toBe(2);
      expect(refused.stderr).toContain("AlphaCard.swift");
      expect(await readFile(view, "utf8")).toEndWith("// mine");

      expect((await run("--update", "--force")).code).toBe(0);
      expect((await readFile(view)).toString("hex")).toBe(first[view]);
      expect(await readFile(wrapper, "utf8")).toBe("struct Wrapper {}");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  90_000,
);

browserTest(
  "CLI --update round-trips a breakpoint conversion and back to a single capture",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-cli-bands-"));
    try {
      const source = join(directory, "page.html");
      const output = join(directory, "generated");
      await Bun.write(
        source,
        '<style>body{margin:0} .side{display:none} @media (min-width:768px){.side{display:block}}</style><main data-markswift-root><aside class="side">Side</aside><p>Text</p></main>',
      );
      const run = async (out: string, ...flags: string[]) => {
        const child = Bun.spawn(
          [process.execPath, join(import.meta.dir, "../../src/cli.ts"), "convert", source, "--out", out, ...flags],
          { stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        return { stdout, stderr, code };
      };
      const snapshot = async (dir: string) => {
        const names = (await readdir(dir, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => join(entry.parentPath, entry.name));
        return Object.fromEntries(
          await Promise.all(names.sort().map(async (name) => [name, (await readFile(name)).toString("hex")])),
        );
      };
      const listed = async (dir: string) =>
        Object.keys(JSON.parse(await readFile(join(dir, ".markswift.json"), "utf8")).files).sort();
      const view = join(output, "ConvertedView.swift");

      expect((await run(output, "--breakpoints", "auto")).code).toBe(0);
      expect(await readFile(view, "utf8")).toContain("MarkswiftBands(");
      const first = await snapshot(output);
      const banded = await listed(output);
      const updated = await run(output, "--update", "--breakpoints", "auto");
      expect(updated.code).toBe(0);
      expect(updated.stdout).toContain("Updated");
      expect(await snapshot(output)).toEqual(first);

      expect((await run(output, "--update")).code).toBe(0);
      const single = join(directory, "single");
      expect((await run(single)).code).toBe(0);
      expect(await readFile(view, "utf8")).toBe(await readFile(join(single, "ConvertedView.swift"), "utf8"));
      expect(await listed(output)).toEqual(banded);
      expect(banded).toEqual(await listed(single));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  180_000,
);
