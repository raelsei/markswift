import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

function element(tag: string, children: LayoutNode[] = [], styles: Record<string, string> = {}, attrs: Record<string, string> = {}): LayoutNode {
  return { id: tag, tag, attrs, children, bounds: { x: 0, y: 0, w: 120, h: 40 }, styles: { display: "block", color: "rgb(0, 0, 0)", "font-size": "14px", "font-family": "system-ui", ...styles } };
}

function document(root: LayoutNode): LayoutDoc {
  return { version: 1, source: "elements.html", combo: { screen: "elements", theme: "light", demoState: "normal" }, size: { w: 120, h: 40 }, dpr: 1, canvas: "white", fonts: [], root };
}

for (const tag of ["canvas", "iframe", "embed", "object", "math", "video", "audio"]) {
  test(`unsupported inline <${tag}> survives as a diagnosed placeholder`, () => {
    const input = document(element("p", [element(tag, [], { display: "inline" })]));
    for (const mode of ["app", "fidelity"] as const) {
      const result = compileLayout(input, { mode });
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        id: tag, kind: "box", confidence: "unmapped", notes: expect.arrayContaining([expect.stringContaining(`<${tag}>`)]),
      }));
    }
  });
}

test("block anchors retain their native link semantics", () => {
  const text: LayoutNode = { ...element("#text"), text: "Visit" };
  const input = document(element("div", [element("a", [text], { display: "block" }, { href: "https://example.com" })]));
  expect(compileLayout(input).code).toContain('Link(destination:');
});

test("wrapped prose links preserve DOM reading order and report their lost destination", () => {
  const before = { ...element("#text"), text: "Before ", bounds: { x: 0, y: 0, w: 40, h: 20 } };
  const linked = { ...element("#text"), text: "long link wrapping", bounds: { x: 0, y: 0, w: 100, h: 40 } };
  const after = { ...element("#text"), text: " After", bounds: { x: 60, y: 20, w: 40, h: 20 } };
  const input = document(element("p", [before, element("a", [linked], { display: "inline" }, { href: "https://example.com" }), after]));
  const screen = inferScreen(input, "elements");
  expect(screen.root.kind).toBe("text");
  if (screen.root.kind !== "text") throw new Error("Prose was split into flow controls");
  expect(screen.root.runs.map(run => run.text).join("")).toBe("Before long link wrapping After");
  expect(compileLayout(input).diagnostics.flatMap(item => item.notes).join("\n")).toContain("destination dropped");
});

test("custom elements preserve children while making missing behavior explicit", () => {
  const child = element("div", [], { "background-color": "red" });
  const input = document(element("profile-card", [child]));
  const screen = inferScreen(input, "elements");
  expect(screen.root.kind).toBe("stack");
  expect(compileLayout(input).diagnostics).toContainEqual(expect.objectContaining({ id: "profile-card", confidence: "approximated" }));
});

test("table and ruby strategies declare their layout approximation", () => {
  for (const tag of ["table", "ruby"]) {
    const input = document(element(tag, [element("span", [{ ...element("#text"), text: "content" }])]));
    expect(compileLayout(input).diagnostics).toContainEqual(expect.objectContaining({ id: tag, confidence: "approximated" }));
  }
});

test("an object's visible fallback remains usable while its resource loss is reported", () => {
  const input = document(element("object", [element("p", [{ ...element("#text"), text: "Resource unavailable" }])]));
  const result = compileLayout(input);
  expect(result.code).toContain("Resource unavailable");
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ id: "object", confidence: "unmapped" }));
});

test("video poster reuses the measured image path in both modes", () => {
  const poster = "data:image/png;base64,iVBORw0KGgo=";
  const input = document(element("video", [], { "object-fit": "cover" }, { poster, controls: "" }));
  const semantic = inferScreen(input, "video").root;
  expect(semantic.kind).toBe("image");
  if (semantic.kind !== "image") throw new Error("Video poster was not an image");
  expect(semantic.src).toBe(poster);
  expect(semantic.contentMode).toBe("fill");
  for (const mode of ["app", "fidelity"] as const) {
    const result = compileLayout(input, { mode });
    expect(result.code).toContain('Image.markswiftData("iVBORw0KGgo=")');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      id: "video", kind: "image", confidence: "approximated",
      notes: expect.arrayContaining([expect.stringContaining("playback")]),
    }));
  }
});
