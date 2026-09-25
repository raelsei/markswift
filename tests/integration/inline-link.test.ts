import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileLayout, type LayoutDoc } from "../../src/compiler/index.ts";
import { inferScreen } from "../../src/analysis/infer.ts";
import type { LayoutNode, Rect } from "../../src/model/layout.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";

const style = { display: "inline", color: "rgb(22, 44, 66)", "font-family": "system-ui", "font-size": "16px", "line-height": "20px" };
const rect = (x: number, y = 0, w = 50): Rect => ({ x, y, w, h: 20 });

function word(text: string, x: number, y = 0, w = 50, lines?: LayoutNode["lines"]): LayoutNode {
  return { tag: "#text", attrs: {}, styles: style, bounds: rect(x, y, w), text, lines, children: [] };
}

function anchor(href: string, text: string, x: number, extraStyle: Record<string, string> = {}): LayoutNode {
  return {
    tag: "a", attrs: { href }, styles: { ...style, ...extraStyle }, bounds: rect(x),
    children: [word(text, x)],
  };
}

function doc(children: LayoutNode[]): LayoutDoc {
  return {
    version: 1, source: "inline-links.html", combo: { screen: "links", theme: "light", demoState: "normal" },
    size: { w: 350, h: 80 }, dpr: 1, canvas: "white", fonts: [],
    root: { id: "prose", tag: "p", attrs: {}, styles: { ...style, display: "block" }, bounds: { x: 0, y: 0, w: 350, h: 40 }, children },
  };
}

test("inline external links keep run order, destinations and individual styles in both modes", () => {
  const input = doc([
    word("Read ", 0),
    anchor("https://example.com/a?x=1&y=2", "docs", 45, { color: "rgb(200, 20, 30)", "font-weight": "700", "text-decoration-line": "underline" }),
    word(" and ", 95),
    anchor("mailto:hi@example.com", "email", 145),
    word(" us.", 195),
  ]);
  const root = inferScreen(input, "links").root;
  expect(root.kind).toBe("text");
  if (root.kind !== "text") throw new Error("Expected one paragraph");
  expect(root.runs.map((run) => run.text).join("")).toBe("Read docs and email us.");
  expect(root.runs.filter((run) => run.href).map((run) => run.href)).toEqual(["https://example.com/a?x=1&y=2", "mailto:hi@example.com"]);
  for (const mode of ["app", "fidelity"] as const) {
    const result = compileLayout(input, { name: "InlineLinks", mode });
    expect(result.code).toContain('Text.markswiftLink("docs", "https://example.com/a?x=1&y=2").font(');
    expect(result.code).toContain('Text.markswiftLink("email", "mailto:hi@example.com").font(');
    expect(result.code).toContain(".underline(");
    expect(result.code).toContain("Color.markswift(0.784, 0.078, 0.118)");
    expect(result.files["MarkswiftRuntime.swift"]).toContain("attributed.link = URL(string: destination)");
    expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).not.toContain("destination dropped");
  }
});

test("a single plain linked paragraph keeps its destination instead of using the greedy text path", () => {
  const result = compileLayout(doc([anchor("https://example.com/read", "Read more now", 0)]), { mode: "app" });
  expect(result.code).toContain('Text.markswiftLink("Read more now", "https://example.com/read")');
  expect(result.code).not.toContain("MarkswiftGreedyText(");
  expect(result.mapping).toMatchObject({ mapped: 1, approximated: 0, unmapped: 0 });
});

test("relative, fragment and unsafe links remain visible with explicit destination loss", () => {
  for (const href of ["/docs", "#toc", "", "javascript:alert(1)", "data:text/html,hi", "https:/malformed"]) {
    const input = doc([word("Open ", 0), anchor(href, "here", 50)]);
    const root = inferScreen(input, "links").root;
    expect(root.kind).toBe("text");
    if (root.kind !== "text") throw new Error("Expected one paragraph");
    expect(root.runs.find((run) => run.text === "here")?.href).toBeUndefined();
    const result = compileLayout(input);
    expect(result.code).not.toContain("Text.markswiftLink(");
    expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).toContain("destination dropped");
  }
});

test("inline and block links serialize spaces and Unicode before Swift URL construction", () => {
  const authored = "https://bücher.example/café au lait?x=1 2";
  const destination = "https://xn--bcher-kva.example/caf%C3%A9%20au%20lait?x=1%202";
  const inline = doc([word("See ", 0), anchor(authored, "article", 40)]);
  const root = inferScreen(inline, "links").root;
  expect(root.kind).toBe("text");
  if (root.kind !== "text") throw new Error("Expected one paragraph");
  expect(root.runs.find((run) => run.text === "article")?.href).toBe(destination);
  expect(compileLayout(inline).code).toContain(`Text.markswiftLink("article", "${destination}")`);

  const block = doc([]);
  block.root = { ...anchor(authored, "article", 0), id: "article", styles: { ...style, display: "block" } };
  const result = compileLayout(block);
  expect(result.code).toContain(`Link(destination: markswiftURL("${destination}"))`);
  expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).not.toContain("no supported runtime destination");
});

test("only fidelity mode reports captured hard line division", () => {
  const input = doc([word("four words that wrap", 0, 0, 160, [
    { bounds: rect(0, 0, 80), start: 0, length: 11 },
    { bounds: rect(0, 20, 80), start: 11, length: 9 },
  ])]);
  const app = compileLayout(input, { mode: "app" });
  const fidelity = compileLayout(input, { mode: "fidelity" });
  expect(app.diagnostics.flatMap((item) => item.notes).join("\n")).not.toContain("line division forced");
  expect(fidelity.diagnostics.flatMap((item) => item.notes).join("\n")).toContain("line division forced");
});

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;
nativeTest("linked text run compiles against the iOS SDK in both modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-inline-links-"));
  try {
    const input = doc([word("Visit ", 0), anchor("https://example.com", "our site", 45, { "font-weight": "700", "text-decoration-line": "underline" }), word(" today.", 100)]);
    for (const mode of ["app", "fidelity"] as const) {
      const output = join(directory, mode);
      const result = compileLayout(input, { name: "InlineLinkView", mode });
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
      const check = await typecheck(output);
      if (!check.ok) throw new Error(check.output);
      expect(check.ok).toBe(true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120000);
