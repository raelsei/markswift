import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtml } from "../../src/index.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
browserTest(
  "font-face stretch distinguishes loaded faces and their native family names",
  async () => {
    const bytes = await Bun.file("tests/conformance/fixtures/assets/geist-latin-wght-normal.woff2").arrayBuffer();
    const url = `data:font/woff2;base64,${Buffer.from(bytes).toString("base64")}`;
    const result = await convertHtml(
      `<style>
    @font-face {font-family: WidthProbe; font-weight:100 900; font-stretch:normal; src:url(${url})}
    @font-face {font-family: WidthProbe; font-weight:100 900; font-stretch:condensed; src:url(${url})}
    main {font:16px WidthProbe; font-stretch:75%; width:300px}
    </style><main>Condensed face</main>`,
      { name: "WidthProbe", root: "main", theme: "light" },
    );
    expect(result.layout.fonts).toHaveLength(2);
    expect(result.layout.fonts.find((f) => f.stretch?.[0] === 75)?.loaded).toBe(true);
    expect(result.layout.fonts.find((f) => f.stretch?.[0] === 100)?.loaded).toBe(false);
    expect(result.code).toContain('"WidthProbe Width 75-75"');
    const dir = await mkdtemp(join(tmpdir(), "markswift-stretch-"));
    try {
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(dir, file), content);
      const check = await typecheck(dir);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

browserTest(
  "a monospace stack retains the installed face Chrome actually rendered",
  async () => {
    const result = await convertHtml(
      `<main style="font:14px ui-monospace,SFMono-Regular,Menlo,monospace">const answer = 42;</main>`,
      { name: "ResolvedMono", root: "main", theme: "light" },
    );
    expect(result.layout.root.resolvedFont).toBe("Menlo");
    expect(result.code).toContain('.custom("Menlo"');
    expect(
      result.diagnostics.flatMap((d) => d.diagnostics).some((d) => d.message.includes("SwiftUI .monospaced")),
    ).toBe(false);
  },
  60_000,
);
