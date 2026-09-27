import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

const style = {
  display: "block", color: "rgb(20, 30, 40)", "font-family": "Arial, sans-serif",
  "font-size": "16px", "line-height": "20px", "text-align": "justify",
};

const doc: LayoutDoc = {
  version: 1, source: "rich.html", combo: { screen: "rich", theme: "light", demoState: "normal" },
  size: { w: 200, h: 60 }, dpr: 1, canvas: "white", fonts: [],
  root: {
    id: "rich", tag: "p", attrs: {}, styles: style, bounds: { x: 0, y: 0, w: 200, h: 60 },
    children: [
      { tag: "#text", attrs: {}, styles: style, bounds: { x: 0, y: 0, w: 45, h: 18 }, text: "Start ", children: [] },
      {
        id: "highlight", tag: "mark", attrs: {}, styles: { ...style, display: "inline", "background-color": "rgb(255, 255, 0)" }, bounds: { x: 45, y: 0, w: 50, h: 18 },
        children: [{ tag: "#text", attrs: {}, styles: style, bounds: { x: 45, y: 0, w: 50, h: 18 }, text: "shine", children: [] }],
      },
      { tag: "wbr", attrs: {}, styles: style, bounds: { x: 95, y: 0, w: 0, h: 18 }, children: [] },
      {
        id: "link", tag: "a", attrs: { href: "#target" }, styles: { ...style, display: "inline", "text-decoration-line": "underline" }, bounds: { x: 0, y: 20, w: 30, h: 18 },
        children: [{ tag: "#text", attrs: {}, styles: style, bounds: { x: 0, y: 20, w: 30, h: 18 }, text: "link", children: [] }],
      },
      { tag: "br", attrs: {}, styles: style, bounds: { x: 30, y: 20, w: 0, h: 18 }, children: [] },
      { tag: "#text", attrs: {}, styles: style, bounds: { x: 0, y: 40, w: 50, h: 18 }, text: "Finish", children: [] },
    ],
  },
};

test("rich inline text retains its content and styles with bounded fill frames in both modes", () => {
  const outputs = (["app", "fidelity"] as const).map((mode) => compileLayout(doc, { name: "RichText", mode }));
  for (const result of outputs) {
    expect(result.code).toContain("\u200b");
    expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).toContain("<wbr>");
    expect(result.diagnostics.flatMap((item) => item.notes).join("\n")).toContain("destination dropped");
    expect(result.code).toContain(".background(Color.markswift(1.0, 1.0, 0.0), in: Rectangle())");
    expect(result.code).toContain("minHeight: 0.0, maxHeight: .infinity");
  }
  // Fill frames explicitly accept smaller proposals with zero width/height minima; rich-text content,
  // break handling, styles and diagnostics remain covered by the assertions above/below.
  expect(outputs.map((result) => createHash("sha256").update(result.code).digest("hex"))).toEqual([
    "198513c0eeddb0fa827aa82294228de09a203ded1ceea5492026000a02a4ef15",
    "3701100604aacc3441ef2febdf8c52ded0f51a3683fb5e44cc6cc9f379385d7f",
  ]);
  expect(outputs[1]!.code).toContain('Text(verbatim: "\\nlink")');
  expect(outputs[1]!.code).not.toContain('Text(verbatim: "\\nFinish")');
});
