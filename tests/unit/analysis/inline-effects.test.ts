import { expect, test } from "bun:test";
import { buildTextRuns } from "../../../src/analysis/text-run-builder.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

const bounds = { x: 0, y: 0, w: 80, h: 20 };
function element(tag: string, styles: Record<string, string> = {}, children: LayoutNode[] = []): LayoutNode {
  return { tag, attrs: {}, bounds, styles: { color: "rgb(10, 20, 30)", "font-family": "system-ui", "font-size": "16px", ...styles }, children };
}
function setup(styles: Record<string, string>, parentStyles: Record<string, string> = {}, hostStyles: Record<string, string> = {}) {
  const text = { ...element("#text"), text: "Hidden spacing" };
  const inline = element("a", styles, [text]);
  inline.attrs.href = "https://example.com";
  const parent = element("span", parentStyles, [inline]);
  const host = element("p", hostStyles, [parent]);
  const notes: string[] = [];
  const result = buildTextRuns(host, [{ node: text, styleOf: inline }], { root: host, bundledFamilies: {}, fixed: [] }, message => notes.push(message));
  return { run: result.out[0]!, notes, painted: result.painted };
}

test("hidden inline runs retain text and font advance without paint, decoration, shadow or a link", () => {
  const { run } = setup({ visibility: "hidden", "text-decoration-line": "underline", "text-decoration-color": "red", "text-shadow": "1px 1px 2px red", "background-clip": "text", "background-image": "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))" });
  expect(run.text).toBe("Hidden spacing");
  expect(run.color.a).toBe(0);
  expect(run.paint).toBeUndefined();
  expect(run.decoration).toBeUndefined();
  expect(run.shadow).toBeUndefined();
  expect(run.href).toBeUndefined();
});

test("nested opacity multiplies glyph, gradient and decoration alpha without including the host", () => {
  const { run } = setup({ opacity: "0.5", color: "rgba(10, 20, 30, 0.8)", "text-decoration-line": "underline", "text-decoration-color": "rgba(200, 0, 0, 0.6)", "background-clip": "text", "background-image": "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))" }, { opacity: "0.5" }, { opacity: "0.4" });
  expect(run.color.a).toBeCloseTo(0.2);
  expect(run.decoration?.color?.a).toBeCloseTo(0.15);
  expect(run.paint && "stops" in run.paint && run.paint.stops.every(stop => stop.color.a === 0.25)).toBe(true);
});

test("computed visible child overrides hidden inline ancestor without overriding ancestor opacity", () => {
  const { run } = setup({ visibility: "visible" }, { visibility: "hidden", opacity: "0.5" });
  expect(run.color.a).toBe(0.5);
  expect(run.href).toBe("https://example.com/");
  expect(setup({}).run.color.a).toBe(1);
});

test("unsupported merged effects name the affected inline property but do not repeat host effects", () => {
  const { notes } = setup({ filter: "blur(3px)", "mask-image": "linear-gradient(black, transparent)", "clip-path": "circle(50%)", "mix-blend-mode": "multiply" });
  for (const property of ["filter", "mask-image", "clip-path", "mix-blend-mode"]) expect(notes.some(note => note.includes("inline " + property))).toBe(true);
  const hostOnly = setup({}, {}, { opacity: "0.5", filter: "blur(3px)" });
  expect(hostOnly.run.color.a).toBe(1);
  expect(hostOnly.notes).toEqual([]);
});

test("inline outline opacity records separate glyph and box compositing even without a background", () => {
  const { notes, painted, run } = setup({ opacity: "0.5", color: "rgb(0, 0, 255)",
    "outline-style": "solid", "outline-width": "8px", "outline-color": "rgb(255, 0, 0)", "outline-offset": "-14px" });
  expect(run.color.a).toBe(0.5);
  expect(painted).toHaveLength(1);
  expect(notes.filter(note => note.includes("CSS group"))).toHaveLength(1);
  expect(notes.join(" ")).toContain("glyph and box paints separately");
});

test("inline borders, shadows and nested decoration share the group-opacity paint predicate", () => {
  const decorations: Array<Record<string, string>> = [
    { "border-top-style": "solid", "border-top-width": "4px", "border-top-color": "rgb(255, 0, 0)" },
    { "box-shadow": "rgb(255, 0, 0) 0px 0px 4px 0px" },
  ];
  for (const decoration of decorations) {
    const { notes, painted } = setup({ opacity: "0.5", ...decoration });
    expect(painted).toHaveLength(1);
    expect(notes.filter(note => note.includes("CSS group"))).toHaveLength(1);
    const nested = setup(decoration, { opacity: "0.5" });
    expect(nested.notes.filter(note => note.includes("CSS group"))).toHaveLength(1);
  }
});

test("unpainted decoration and zero or full opacity do not claim a group-compositing difference", () => {
  const decorations: Array<Record<string, string>> = [
    {},
    { "outline-style": "none", "outline-width": "8px", "outline-color": "rgb(255, 0, 0)" },
    { "outline-style": "solid", "outline-width": "0px", "outline-color": "rgb(255, 0, 0)" },
    { "outline-style": "solid", "outline-width": "8px", "outline-color": "rgba(255, 0, 0, 0)" },
    { "border-top-style": "hidden", "border-top-width": "4px", "border-top-color": "rgb(255, 0, 0)" },
    { "border-top-style": "solid", "border-top-width": "4px", "border-top-color": "transparent" },
    { "box-shadow": "none" },
    { "box-shadow": "rgba(255, 0, 0, 0) 0px 0px 4px 0px" },
  ];
  for (const decoration of decorations) {
    const { notes, painted } = setup({ opacity: "0.5", ...decoration });
    expect(painted).toHaveLength(0);
    expect(notes.some(note => note.includes("CSS group"))).toBe(false);
  }
  for (const opacity of ["0", "1"]) {
    const { notes } = setup({ opacity, "outline-style": "solid", "outline-width": "8px", "outline-color": "rgb(255, 0, 0)" });
    expect(notes.some(note => note.includes("CSS group"))).toBe(false);
  }
});
