import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inferScreen } from "../../src/analysis/infer.ts";
import { type ConversionResult, convertHtml } from "../../src/index.ts";
import type { LayoutNode } from "../../src/model/layout.ts";
import type { ImageNode, SemNode, TextNode } from "../../src/model/semantic.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

const FIXTURES = "tests/conformance/fixtures/css-paint";
const convert = async (file: string, mode: "app" | "fidelity" = "app") =>
  convertHtml(await Bun.file(join(FIXTURES, file)).text(), {
    name: file === "content-url.html" ? "ContentUrl" : "ListStyleImage",
    mode,
    theme: "light",
    viewport: { width: 390, height: 800 },
  });

function semNodes(root: SemNode, out: SemNode[] = []): SemNode[] {
  out.push(root);
  for (const c of "children" in root && root.children ? root.children : []) semNodes(c, out);
  for (const c of "content" in root && root.content ? root.content : []) semNodes(c, out);
  for (const o of root.overlays) semNodes(o.node, out);
  return out;
}
const texts = (nodes: SemNode[]) => nodes.filter((n): n is TextNode => n.kind === "text");
const generatedNotes = (r: ConversionResult) =>
  r.diagnostics
    .flatMap((d) => d.diagnostics)
    .filter((d) => d.feature === "content" || d.feature === "list-style-image");

browserTest(
  "content-url: multi-part text, inline image runs, a block image with alt",
  async () => {
    const result = await convert("content-url.html");
    let plan: LayoutNode | undefined;
    const walk = (n: LayoutNode) => {
      if (n.attrs["data-label"] === "Plan") plan = n;
      n.children.forEach(walk);
    };
    walk(result.layout.root);
    const before = plan!.children.find((c) => c.tag === "::before")!;
    expect(before.children.map((c) => c.text)).toEqual(["I. Plan · "]);
    const nodes = semNodes(inferScreen(result.layout, "s").root);
    const badge = texts(nodes).find((t) => t.runs.some((r) => r.text === "Dark mode for every component"))!;
    expect(badge.runs[0]!.image).toMatchObject({ w: 24, h: 16 });
    const ext = texts(nodes).find((t) => t.runs.some((r) => r.text.includes("before upgrading")))!;
    expect(ext.runs.some((r) => r.image?.vector)).toBe(true);
    expect(nodes.filter((n): n is ImageNode => n.kind === "image").map((n) => n.alt)).toContain("Info");
    expect(generatedNotes(result)).toEqual([]);
  },
  60_000,
);

browserTest(
  "list-style-image: counter rows, raw inside markers, image overlays for outside markers",
  async () => {
    const result = await convert("list-style-image.html");
    expect(result.code).toContain("markswiftCounter(ordinal, .upperRoman)");
    const nodes = semNodes(inferScreen(result.layout, "s").root);
    const roman = texts(nodes).flatMap((t) => t.runs.filter((r) => r.counter?.style === "upper-roman"));
    expect(roman.map((r) => r.text)).toEqual(["I. ", "II. ", "III. ", "IV. "]);
    for (const r of roman) expect(r.text).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
    const overlaid = nodes
      .flatMap((n) => n.overlays.map((o) => o.node))
      .filter((n) => semNodes(n).some((k) => k.kind === "image"));
    expect(overlaid.length).toBeGreaterThanOrEqual(3);
    expect(generatedNotes(result)).toEqual([]);
  },
  60_000,
);

nativeTest(
  "both fixtures typecheck in app and fidelity mode",
  async () => {
    for (const file of ["content-url.html", "list-style-image.html"])
      for (const mode of ["app", "fidelity"] as const) {
        const result = await convert(file, mode);
        const directory = await mkdtemp(join(tmpdir(), "markswift-generated-"));
        try {
          for (const [name, value] of Object.entries(result.files)) await Bun.write(join(directory, name), value);
          const check = await typecheck(directory);
          if (!check.ok) throw new Error(`${file} ${mode}: ${check.output}`);
          expect(check.ok).toBe(true);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
  },
  300_000,
);
