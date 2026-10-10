import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

const layout: LayoutDoc = {
  version: 2,
  source: "component.html",
  combo: { screen: "card", theme: "light" },
  size: { w: 200, h: 80 },
  dpr: 1,
  canvas: "rgb(255, 255, 255)",
  fonts: [],
  root: {
    id: "root",
    tag: "main",
    attrs: {},
    styles: { display: "block", "background-color": "rgb(255, 0, 0)" },
    bounds: { x: 0, y: 0, w: 200, h: 80 },
    children: [],
  },
};

test("captured-layout compilation is deterministic and does not mutate the input", () => {
  const before = structuredClone(layout);
  const first = compileLayout(layout, { name: "CardView" });
  expect(first).toEqual(compileLayout(layout, { name: "CardView" }));
  expect(layout).toEqual(before);
  expect(first.files["CardView.swift"]).toBe(first.code);
  expect(first.code).toContain("struct CardView: View");
  expect(Object.keys(first.files)).toEqual(["CardView.swift", "MarkswiftRuntime.swift", "CardView+Tokens.swift"]);
});

test("two conversions share only the identical runtime file", () => {
  const a = compileLayout(layout, { name: "CardA" }),
    b = compileLayout(layout, { name: "CardB" });
  const shared = Object.keys(a.files).filter((f) => f in b.files);
  expect(shared).toEqual(["MarkswiftRuntime.swift"]);
  expect(a.files["MarkswiftRuntime.swift"]).toBe(b.files["MarkswiftRuntime.swift"]!);
  for (const [file, src] of Object.entries(a.files)) {
    if (file !== "MarkswiftRuntime.swift") expect(src).toMatch(/\b(struct|extension) CardA\b/);
    expect(src).not.toMatch(/^extension Color \{\n\s+static let /m);
  }
});

test("serialized CSS sizing intent survives public compilation", () => {
  const input = structuredClone(layout);
  input.root.children = [
    {
      id: "section",
      tag: "section",
      attrs: {},
      styles: { display: "block" },
      preferredSize: { width: "100px", height: "40px" },
      bounds: { x: 0, y: 0, w: 100, h: 40 },
      children: [
        { tag: "div", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 100, h: 40 }, children: [] },
      ],
    },
  ];
  const restored = JSON.parse(JSON.stringify(input));
  const before = structuredClone(restored);
  for (const mode of ["app", "fidelity"] as const) {
    expect(compileLayout(restored, { mode }).code).toContain("width: 100.0, height: 40.0");
  }
  expect(restored).toEqual(before);
  expect(() => compileLayout(layout)).not.toThrow();
});

test("invalid and conflicting type names cannot corrupt output files or Swift types", () => {
  for (const name of [
    "../View",
    "bad name",
    "1Card",
    "Self",
    "View",
    "Text",
    "Color",
    "UIImage",
    "UIFont",
    "UIFontDescriptor",
    "StrokeStyle",
    "AsyncImage",
    "MarkswiftShapes",
  ]) {
    expect(() => compileLayout(layout, { name })).toThrow();
  }
});

test("HTML metadata containing newlines remains inside generated comments", () => {
  const input = structuredClone(layout);
  input.source = "part\ninjected";
  input.root.id = "root\r\ninjected";
  const output = compileLayout(input);
  expect(output.code).not.toMatch(/^injected/m);
  expect(output.code).toContain("Source: part injected");
});

test("loopback image URLs are never emitted and are diagnosed", () => {
  const input = structuredClone(layout);
  input.root.children = [
    {
      id: "pic",
      tag: "img",
      attrs: { alt: "A" },
      currentSrc: "http://127.0.0.1:5555/a.png",
      styles: { display: "block" },
      bounds: { x: 0, y: 0, w: 20, h: 20 },
      children: [],
    },
    {
      id: "bg",
      tag: "div",
      attrs: {},
      styles: { display: "block", "background-image": 'url("http://localhost:1/b.png")' },
      bounds: { x: 0, y: 20, w: 20, h: 20 },
      children: [],
    },
  ];
  const output = compileLayout(input);
  expect(output.code).not.toContain("127.0.0.1");
  expect(output.code).not.toContain("localhost");
  expect(output.code).not.toContain("AsyncImage");
  expect(output.code).toContain('Text(verbatim: "A")');
  const notes = output.diagnostics
    .flatMap((d) => d.diagnostics)
    .map((d) => d.message)
    .join("\n");
  expect(notes).toContain("http://127.0.0.1:5555/a.png");
  expect(notes).toContain("http://localhost:1/b.png");
});

test("raster images ship once as Images/ files", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const img = (id: string, src: string, x: number, attrs: Record<string, string> = {}) => ({
    id,
    tag: "img",
    attrs,
    currentSrc: src,
    styles: { display: "block" },
    bounds: { x, y: 0, w: 20, h: 20 },
    children: [],
  });
  const input = structuredClone(layout);
  input.root.children = [
    img("a", png, 0),
    img("b", png, 20),
    img("c", png, 40),
    {
      id: "bg",
      tag: "div",
      attrs: {},
      styles: { display: "block", "background-image": `url("${png}")` },
      bounds: { x: 60, y: 0, w: 20, h: 20 },
      children: [],
    },
    img("jpeg", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==", 80),
    img("logo", "logo.png", 100, { alt: "Logo" }),
  ];
  for (const mode of ["app", "fidelity"] as const) {
    const result = compileLayout(input, { mode });
    expect(compileLayout(input, { mode })).toEqual(result);
    const files = Object.keys(result.assets).sort();
    expect(files).toHaveLength(2);
    for (const file of files) expect(file).toMatch(/^Images\/[0-9a-f]{12}\.(png|jpg)$/);
    expect(files.map((f) => f.slice(-3)).sort()).toEqual(["jpg", "png"]);
    expect(result.code.match(/Image\.markswiftAsset\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(result.code).not.toContain("iVBOR");
    expect(result.code).not.toContain('Image("logo")');
    expect(result.code).toContain('Text(verbatim: "Logo")');
    expect(
      result.diagnostics
        .flatMap((d) => d.diagnostics)
        .map((d) => d.message)
        .join("\n"),
    ).toContain("logo.png");
  }
});
