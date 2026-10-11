import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { StackNode } from "../../../src/model/semantic.ts";

function element(bounds: Rect, styles: Record<string, string>, children: LayoutNode[] = []): LayoutNode {
  return { tag: "div", attrs: {}, styles, bounds, children };
}

function screen(root: LayoutNode): StackNode {
  const doc: LayoutDoc = {
    version: 2,
    source: "flow-layout-test",
    combo: { screen: "s", theme: "light" },
    size: { w: root.bounds.w, h: root.bounds.h },
    dpr: 1,
    canvas: "rgb(255, 255, 255)",
    fonts: [],
    root,
  };
  const node = inferScreen(doc, "s").root;
  if (node.kind !== "stack") throw new Error("Expected stack root");
  return node;
}

describe("flex alignment insets", () => {
  test("a vertically centered row keeps alignment space out of padding", () => {
    const child = element({ x: 105, y: 113, w: 180, h: 294 }, { display: "block" });
    const root = screen(
      element(
        { x: 0, y: 0, w: 390, h: 520 },
        {
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "min-height": "520px",
        },
        [child],
      ),
    );

    expect(root.align).toBe("center");
    expect(root.distribution).toBe("center");
    expect(root.padding).toEqual([0, 0, 0, 0]);
    expect(root.leadInset).toBe(0);
  });

  test.each([
    ["center", 110],
    ["flex-end", 220],
    ["space-between", 0],
    ["space-around", 110],
    ["space-evenly", 110],
  ] as const)("a column with justify-content:%s keeps distribution space out of padding", (justify, y) => {
    const child = element({ x: 0, y, w: 180, h: 300 }, { display: "block" });
    const root = screen(
      element(
        { x: 0, y: 0, w: 390, h: 520 },
        {
          display: "flex",
          "flex-direction": "column",
          "justify-content": justify,
        },
        [child],
      ),
    );

    expect(root.padding).toEqual([0, 0, 0, 0]);
  });

  test("centered flex content retains explicit padding and its bottom margin", () => {
    // Content box is y=20...480; the 300px child and 12px bottom margin are centered in it.
    const child = element(
      { x: 30, y: 94, w: 180, h: 300 },
      {
        display: "block",
        "margin-bottom": "12px",
      },
    );
    const root = screen(
      element(
        { x: 0, y: 0, w: 390, h: 520 },
        {
          display: "flex",
          "align-items": "center",
          "padding-top": "20px",
          "padding-right": "10px",
          "padding-bottom": "40px",
          "padding-left": "30px",
        },
        [child],
      ),
    );

    expect(root.padding).toEqual([20, 10, 52, 30]);
  });

  test("a hugging block still retains its final child margin", () => {
    const child = element(
      { x: 0, y: 0, w: 180, h: 300 },
      {
        display: "block",
        "margin-bottom": "12px",
      },
    );
    const root = screen(
      element(
        { x: 0, y: 0, w: 180, h: 332 },
        {
          display: "block",
          "padding-bottom": "20px",
        },
        [child],
      ),
    );

    expect(root.padding).toEqual([0, 0, 32, 0]);
  });
});
