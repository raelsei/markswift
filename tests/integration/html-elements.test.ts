import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../src/model/layout.ts";

const browserTest = (process.env.MARKSWIFT_BROWSER_TESTS ?? process.env.H2S_BROWSER_TESTS) === "1" ? test : test.skip;
const CONTAINERS = ["article", "section", "nav", "main", "aside", "header", "footer", "search", "div"] as const;
const FAMILY_STYLES = {
  block: "display:block",
  flex: "display:flex;flex-direction:row;align-items:flex-start;justify-content:flex-start;gap:8px",
  grid: "display:grid;grid-template-columns:40px 40px;grid-auto-rows:20px;align-content:start;gap:8px",
} as const;
// Fidelity retains explicit flex/grid tracks, including their unused container space.
const FAMILY_CONSTRUCTORS = { block: "VStack(", flex: "MarkswiftMeasuredLayout(", grid: "MarkswiftMeasuredLayout(" } as const;

/** Compare a captured subtree without its position in the family document or capture IDs. */
function rebase(node: LayoutNode, origin: Rect, id = "sample"): LayoutNode {
  const { id: _sourceId, ...attrs } = node.attrs;
  return {
    ...node,
    id,
    attrs,
    bounds: { ...node.bounds, x: node.bounds.x - origin.x, y: node.bounds.y - origin.y },
    children: node.children.map((child, index) => rebase(child, origin, `${id}/${index}`)),
  };
}

function geometry(node: LayoutNode): unknown {
  return { bounds: node.bounds, children: node.children.map(geometry) };
}

function findLayout(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.attrs.id === id) return node;
  for (const child of node.children) {
    const found = findLayout(child, id);
    if (found) return found;
  }
  return undefined;
}

for (const family of Object.keys(FAMILY_STYLES) as Array<keyof typeof FAMILY_STYLES>) {
  browserTest(`semantic containers share ${family} geometry and Swift layout regardless of tag`, async () => {
    const samples = CONTAINERS.map(tag => `<${tag} id="sample-${tag}" class="sample"><div class="item"></div><div class="item"></div></${tag}>`).join("");
    const result = await convertHtml(`<div data-markswift-root>${samples}</div>`, {
      name: "ElementFamily",
      mode: "fidelity",
      viewport: { width: 320, height: 1200 },
      css: `
        html,body{margin:0}
        [data-markswift-root]{box-sizing:border-box;width:280px;padding:20px}
        .sample{box-sizing:border-box;width:240px;height:100px;padding:10px;margin:0;${FAMILY_STYLES[family]}}
        .sample+.sample{margin-top:10px}
        .item{box-sizing:border-box;width:40px;height:20px;background:rgb(255,0,0)}
      `,
    });
    expect(result.warnings).toEqual([]);
    const samplesByTag = CONTAINERS.map(tag => {
      const captured = result.layout.root.children.find(node => node.attrs.id === `sample-${tag}`);
      if (!captured) throw new Error(`Missing captured <${tag}> in ${family} family`);
      expect(captured.tag).toBe(tag);
      expect(captured.styles.display).toBe(family === "flex" ? "flex" : family === "grid" ? "grid" : "block");
      expect(captured.bounds.w).toBe(240);
      expect(captured.bounds.h).toBe(100);
      expect(captured.children).toHaveLength(2);
      return rebase(captured, captured.bounds);
    });
    const baseline = geometry(samplesByTag[0]!);
    const compiled = samplesByTag.map(root => {
      expect(geometry(root)).toEqual(baseline);
      const layout: LayoutDoc = { ...result.layout, root, size: { w: root.bounds.w, h: root.bounds.h } };
      const output = compileLayout(layout, { name: "ElementFamily", mode: "fidelity" });
      expect(output.code).toContain(FAMILY_CONSTRUCTORS[family]);
      if (family === "flex") {
        expect(compileLayout(layout, { name: "ElementFamily", mode: "app" }).code).toContain("MarkswiftAllocatedLayout(");
      }
      expect(output.diagnostics.some(diagnostic => diagnostic.confidence === "unmapped")).toBe(false);
      return output.code;
    });
    for (const code of compiled) expect(code).toBe(compiled[0]!);
  }, 60000);
}

// A source-less <embed> has no layout box in Chrome. Supply a self-contained rendered resource.
const EMBED_SVG = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="36"><rect width="60" height="36" fill="red"/></svg>');
const UNSUPPORTED_MARKUP = {
  canvas: '<canvas id="unsupported-canvas" class="unsupported">Canvas fallback</canvas>',
  iframe: '<iframe id="unsupported-iframe" class="unsupported" srcdoc="<p>Local frame</p>"></iframe>',
  embed: `<embed id="unsupported-embed" class="unsupported" type="image/svg+xml" src="${EMBED_SVG}">`,
  math: '<math id="unsupported-math" class="unsupported"><mi>x</mi></math>',
  video: '<video id="unsupported-video" class="unsupported" controls>Video fallback</video>',
  audio: '<audio id="unsupported-audio" class="unsupported" controls>Audio fallback</audio>',
} as const;

for (const [tag, markup] of Object.entries(UNSUPPORTED_MARKUP)) {
  browserTest(`nested inline <${tag}> produces an unmapped placeholder instead of disappearing into text`, async () => {
    const result = await convertHtml(`<div data-markswift-root><span>Before <span>${markup}</span> After</span></div>`, {
      name: "UnsupportedElement",
      css: `
        html,body{margin:0}
        [data-markswift-root]{width:300px;height:100px;font:16px Arial,sans-serif}
        .unsupported{display:inline;width:60px;height:36px;border:0}
      `,
    });
    const captured = findLayout(result.layout.root, `unsupported-${tag}`);
    expect(captured).toBeDefined();
    expect(captured!.bounds.w).toBeGreaterThan(0);
    expect(captured!.bounds.h).toBeGreaterThan(0);
    const diagnostic = result.diagnostics.find(item => item.id === `#unsupported-${tag}`);
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.kind).toBe("box");
    expect(diagnostic!.confidence).toBe("unmapped");
    expect(diagnostic!.notes.some(note => note.startsWith("unmapped:") && note.includes(`<${tag}>`))).toBe(true);
    expect(result.code).toContain("Before");
    expect(result.code).toContain("After");
  }, 30000);
}

browserTest("an unsupported inline object retains its visible fallback and reports its limitation", async () => {
  const result = await convertHtml('<div data-markswift-root><span>Before <object id="unsupported-object" type="application/x-markswift-test"><span>Visible fallback</span></object> After</span></div>', {
    name: "ObjectFallback",
    css: "html,body{margin:0}[data-markswift-root]{width:300px;height:100px;font:16px Arial,sans-serif}",
  });
  const captured = findLayout(result.layout.root, "unsupported-object");
  expect(captured).toBeDefined();
  expect(captured!.bounds.w).toBeGreaterThan(0);
  expect(captured!.bounds.h).toBeGreaterThan(0);
  const diagnostic = result.diagnostics.find(item => item.id === "#unsupported-object");
  expect(diagnostic).toBeDefined();
  expect(diagnostic!.confidence).toBe("unmapped");
  expect(diagnostic!.notes.some(note => note.startsWith("unmapped:") && note.includes("<object>"))).toBe(true);
  expect(result.code).toContain("Visible fallback");
  expect(result.code).toContain("Before");
  expect(result.code).toContain("After");
}, 30000);
