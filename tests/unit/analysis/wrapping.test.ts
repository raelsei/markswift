import { LAYOUT_DOC_VERSION } from "../../../src/model/layout.ts";
import { describe, expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode, Rect } from "../../../src/model/layout.ts";
import type { StackNode } from "../../../src/model/semantic.ts";

function child(
  id: string,
  x: number,
  y: number,
  styles: Record<string, string> = {},
  preferred = { width: "80px", height: "40px" },
): LayoutNode {
  return {
    tag: "div",
    id: `#${id}`,
    attrs: { id },
    children: [],
    bounds: { x, y, w: 80, h: 40 },
    preferredSize: preferred,
    styles: {
      display: "block",
      "box-sizing": "border-box",
      "flex-grow": "0",
      "flex-shrink": "0",
      "flex-basis": "auto",
      ...styles,
    },
  };
}

function root(
  children: LayoutNode[],
  styles: Record<string, string> = {},
  bounds: Rect = { x: 0, y: 0, w: 200, h: 90 },
  height = "auto",
  screenHeight = bounds.h,
): StackNode {
  const element: LayoutNode = {
    tag: "div",
    attrs: {},
    bounds,
    children,
    preferredSize: { width: `${bounds.w}px`, height },
    styles: {
      display: "flex",
      "flex-direction": "row",
      "flex-wrap": "wrap",
      "column-gap": "10px",
      "row-gap": "10px",
      "align-items": "flex-start",
      "justify-content": "flex-start",
      "align-content": "normal",
      ...styles,
    },
  };
  const nested = screenHeight !== bounds.h;
  const page: LayoutNode = nested
    ? {
        tag: "main",
        attrs: {},
        bounds: { x: 0, y: 0, w: bounds.w, h: screenHeight },
        children: [element],
        styles: { display: "block" },
      }
    : element;
  const doc: LayoutDoc = {
    version: LAYOUT_DOC_VERSION,
    source: "wrap-test",
    combo: { screen: "s", theme: "light" },
    size: { w: bounds.w, h: screenHeight },
    viewport: { x: 0, y: 0, w: bounds.w, h: screenHeight },
    conditions: [],
    dpr: 1,
    canvas: "rgb(255,255,255)",
    fonts: [],
    root: page,
  };
  const screen = inferScreen(doc, "s");
  const node = nested && screen.root.kind === "stack" ? screen.root.children[0]! : screen.root;
  if (node.kind !== "stack") throw new Error("Expected wrapping stack");
  return node;
}

function measuredFrames(node: StackNode): Record<string, Rect> {
  const result: Record<string, Rect> = {};
  if (!node.measured) return result;
  node.children.forEach((child, index) => {
    result[child.id] = node.measured!.frames[index]!;
  });
  return result;
}

describe("fixed-item row wrapping", () => {
  test("ordinary row wrap carries native gaps instead of freezing captured rows", () => {
    const node = root([child("a", 0, 0), child("b", 90, 0), child("c", 0, 50)]);
    expect(node.wrap).toEqual({ columnGap: 10, rowGap: 10 });
    expect(node.measured).toBeUndefined();
    expect(node.children.map((child) => child.id)).toEqual(["#a", "#b", "#c"]);
    expect(node.diagnostics.map((d) => d.message)).not.toContain("flex-wrap → fixed rows from the snapshot");
  });

  test("a single item on every line still remains a wrapping layout", () => {
    const node = root([child("a", 0, 0), child("b", 0, 50), child("c", 0, 100)], {}, { x: 0, y: 0, w: 80, h: 140 });
    expect(node.wrap).toEqual({ columnGap: 10, rowGap: 10 });
    expect(node.children).toHaveLength(3);
    expect(node.measured).toBeUndefined();
  });

  test("a fixed-height host supports native wrapping when align-content explicitly packs at start", () => {
    const node = root(
      [child("a", 0, 0), child("b", 90, 0), child("c", 0, 50)],
      { "align-content": "flex-start" },
      { x: 0, y: 0, w: 200, h: 200 },
      "200px",
    );
    expect(node.wrap).toEqual({ columnGap: 10, rowGap: 10 });
    expect(node.measured).toBeUndefined();
  });

  test("a hugging host can keep centered rows because its height reflows with them", () => {
    const node = root([child("a", 0, 0), child("b", 90, 0), child("c", 0, 50)], { "align-content": "center" });
    expect(node.wrap).toEqual({ columnGap: 10, rowGap: 10 });
    expect(node.measured).toBeUndefined();
  });

  test("fixed content-box items retain their full padding in native row geometry", () => {
    const insets = {
      "box-sizing": "content-box",
      "padding-top": "10px",
      "padding-right": "10px",
      "padding-bottom": "10px",
      "padding-left": "10px",
    };
    const node = root([
      child("a", 0, 0, insets, { width: "60px", height: "20px" }),
      child("b", 90, 0, insets, { width: "60px", height: "20px" }),
      child("c", 0, 50, insets, { width: "60px", height: "20px" }),
    ]);
    expect(node.wrap).toEqual({ columnGap: 10, rowGap: 10 });
  });

  test("centered row content retains per-row cross alignment with unequal fixed heights", () => {
    const short = (id: string, x: number, y: number) => ({
      ...child(id, x, y, {}, { width: "80px", height: "20px" }),
      bounds: { x, y, w: 80, h: 20 },
    });
    const node = root(
      [short("a", 15, 10), child("b", 105, 0), short("c", 60, 50)],
      {
        "justify-content": "center",
        "align-items": "center",
      },
      { x: 0, y: 0, w: 200, h: 70 },
    );
    expect(node.wrap).toEqual({ columnGap: 10, rowGap: 10 });
    expect(node.align).toBe("center");
    expect(node.distribution).toBe("center");
  });

  test("align-content start keeps centered unequal children at the top of a fixed-height host", () => {
    const short = (id: string, x: number, y: number) => ({
      ...child(id, x, y, {}, { width: "80px", height: "20px" }),
      bounds: { x, y, w: 80, h: 20 },
    });
    const node = root(
      [short("a", 15, 10), child("b", 105, 0), short("c", 60, 50)],
      {
        "justify-content": "center",
        "align-items": "center",
        "align-content": "start",
      },
      { x: 0, y: 0, w: 200, h: 200 },
      "200px",
      300,
    );
    expect(node.wrap).toEqual({ columnGap: 10, rowGap: 10 });
    expect(node.measured).toBeUndefined();
    expect(node.height).toEqual({ kind: "fixed", px: 200 });
    expect(node.padding).toEqual([0, 0, 0, 0]);
    expect(node.children.map((item) => item.frame.y)).toEqual([10, 0, 50]);
  });
});

describe("measured wrapping fallback", () => {
  test.each(["center", "flex-end", "space-between", "normal"])(
    "a fixed host diagnoses %s even when captured rows exactly fill its height",
    (alignContent) => {
      const node = root(
        [child("a", 0, 0), child("b", 90, 0), child("c", 0, 50)],
        { "align-content": alignContent },
        { x: 0, y: 0, w: 200, h: 90 },
        "90px",
        200,
      );
      expect(node.wrap).toBeUndefined();
      expect(node.measured).toMatchObject({ width: 200, height: 90 });
      expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("align-content");
    },
  );

  test("a minimum-height host cannot assume centered rows remain hugging after reflow", () => {
    const node = root(
      [child("a", 0, 0), child("b", 90, 0), child("c", 0, 50)],
      { "align-content": "center", "min-height": "90px" },
      { x: 0, y: 0, w: 200, h: 90 },
      "auto",
      200,
    );
    expect(node.wrap).toBeUndefined();
    expect(node.measured).toMatchObject({ width: 200, height: 90 });
  });

  test("wrap-reverse preserves all child positions, including the single-item upper row", () => {
    const node = root([child("a", 0, 50), child("b", 90, 50), child("c", 0, 0)], { "flex-wrap": "wrap-reverse" });
    expect(node.wrap).toBeUndefined();
    expect(node.measured).toMatchObject({ width: 200, height: 90 });
    expect(measuredFrames(node)).toEqual({
      "#a": { x: 0, y: 50, w: 80, h: 40 },
      "#b": { x: 90, y: 50, w: 80, h: 40 },
      "#c": { x: 0, y: 0, w: 80, h: 40 },
    });
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("wrap-reverse");
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("cannot reflow");
  });

  test("column wrapping preserves columns rather than flattening every child vertically", () => {
    const node = root(
      [child("a", 0, 0), child("b", 0, 50), child("c", 90, 0)],
      { "flex-direction": "column" },
      { x: 0, y: 0, w: 170, h: 90 },
      "90px",
    );
    expect(node.wrap).toBeUndefined();
    expect(node.measured).toMatchObject({ width: 170, height: 90 });
    expect(measuredFrames(node)["#c"]).toEqual({ x: 90, y: 0, w: 80, h: 40 });
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("column");
  });

  test("unsupported fixed-height cross-row distribution preserves captured geometry", () => {
    const node = root(
      [child("a", 0, 0), child("b", 90, 0), child("c", 0, 105)],
      {},
      { x: 0, y: 0, w: 200, h: 200 },
      "200px",
    );
    expect(node.wrap).toBeUndefined();
    expect(measuredFrames(node)["#c"]).toEqual({ x: 0, y: 105, w: 80, h: 40 });
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("align-content");
  });

  test("fallback coordinates are relative to content origin rather than border box", () => {
    const node = root(
      [child("a", 23, 35), child("b", 113, 35), child("c", 23, 85)],
      {
        "flex-wrap": "wrap-reverse",
        "padding-top": "10px",
        "padding-left": "8px",
        "padding-right": "8px",
        "padding-bottom": "10px",
        "border-top-style": "solid",
        "border-left-style": "solid",
        "border-right-style": "solid",
        "border-bottom-style": "solid",
        "border-top-width": "5px",
        "border-left-width": "5px",
        "border-right-width": "5px",
        "border-bottom-width": "5px",
      },
      { x: 10, y: 20, w: 226, h: 120 },
    );
    expect(node.measured).toMatchObject({ width: 200, height: 90 });
    expect(measuredFrames(node)["#a"]).toEqual({ x: 0, y: 0, w: 80, h: 40 });
    expect(measuredFrames(node)["#c"]).toEqual({ x: 0, y: 50, w: 80, h: 40 });
  });

  test.each([
    [{ "justify-content": "space-between" }, {}, "justify-content"],
    [{ "align-items": "baseline" }, {}, "align-items"],
    [{}, { "flex-grow": "1" }, "allocation"],
    [{}, { "margin-left": "5px" }, "margin"],
    [{}, { "align-self": "center" }, "align-self"],
  ] as const)(
    "unsupported alignment/allocation remains a diagnosed measured layout",
    (hostStyles, childStyles, reason) => {
      const node = root([child("a", 0, 0, childStyles), child("b", 90, 0), child("c", 0, 50)], hostStyles);
      expect(node.wrap).toBeUndefined();
      expect(node.measured?.frames).toHaveLength(3);
      expect(node.diagnostics.map((d) => d.message).join(" ")).toContain(reason);
      expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("cannot reflow");
    },
  );

  test("observed shrinking of a preferred fixed width uses captured positions", () => {
    const node = root(
      [child("a", 0, 0, { "flex-shrink": "1" }, { width: "120px", height: "40px" })],
      {},
      { x: 0, y: 0, w: 80, h: 40 },
    );
    expect(node.wrap).toBeUndefined();
    expect(node.measured?.frames).toHaveLength(1);
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("allocation");
  });

  test("an unshrunk item with the default flex-shrink reflows natively", () => {
    const item = child("a", 0, 0, { "flex-shrink": "1" }, { width: "150px", height: "40px" });
    item.bounds.w = 150;
    const node = root([item], {}, { x: 0, y: 0, w: 200, h: 40 });
    expect(node.wrap).toBeDefined();
    expect(node.measured).toBeUndefined();
  });

  test("stretch-dependent auto heights fall back because merged rows can change their height", () => {
    const fixed = child("a", 0, 0);
    const short = child("b", 90, 0, {}, { width: "80px", height: "20px" });
    short.bounds.h = 20;
    const stretched = child("c", 0, 50, { "min-height": "20px" }, { width: "80px", height: "auto" });
    stretched.bounds.h = 20;
    const node = root([fixed, short, stretched], { "align-items": "stretch" }, { x: 0, y: 0, w: 200, h: 70 });
    expect(node.wrap).toBeUndefined();
    expect(measuredFrames(node)["#c"]).toEqual({ x: 0, y: 50, w: 80, h: 20 });
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("stretch-dependent");
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("cannot reflow");
  });

  test("captured row breaks that disagree with fixed-size native fitting use fallback", () => {
    const node = root([child("a", 0, 0), child("b", 0, 50)], {}, { x: 0, y: 0, w: 200, h: 90 });
    expect(node.wrap).toBeUndefined();
    expect(node.measured?.frames).toHaveLength(2);
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("ambiguous main-axis wrapping");
  });
});

const TEXT = { "font-family": "system-ui", "font-size": "14px", "line-height": "20px", color: "rgb(0, 0, 0)" };

/** A padded `span` chip sized by its "Design" label, with the CSS default flex-shrink: 1. */
function chip(id: string, x: number, y: number, w = 60): LayoutNode {
  return {
    tag: "span",
    id: `#${id}`,
    attrs: { id },
    bounds: { x, y, w, h: 28 },
    preferredSize: { width: "auto", height: "auto" },
    styles: {
      display: "block",
      "flex-grow": "0",
      "flex-shrink": "1",
      "padding-left": "12px",
      "padding-right": "12px",
      "padding-top": "4px",
      "padding-bottom": "4px",
      ...TEXT,
    },
    children: [
      {
        tag: "#text",
        attrs: {},
        styles: { ...TEXT },
        bounds: { x: x + 12, y: y + 7, w: 36, h: 14 },
        text: "Design",
        children: [],
      },
    ],
  };
}

function chipDoc(children: LayoutNode[], styles: Record<string, string> = {}): LayoutDoc {
  const host: LayoutNode = {
    tag: "div",
    attrs: {},
    bounds: { x: 0, y: 0, w: 180, h: 66 },
    children,
    preferredSize: { width: "180px", height: "auto" },
    styles: {
      display: "flex",
      "flex-direction": "row",
      "flex-wrap": "wrap",
      "column-gap": "10px",
      "row-gap": "10px",
      "align-items": "flex-start",
      "justify-content": "flex-start",
      "align-content": "normal",
      ...TEXT,
      ...styles,
    },
  };
  return {
    version: LAYOUT_DOC_VERSION,
    source: "wrap-test",
    combo: { screen: "s", theme: "light" },
    size: { w: 180, h: 66 },
    viewport: { x: 0, y: 0, w: 180, h: 66 },
    conditions: [],
    dpr: 1,
    canvas: "rgb(255,255,255)",
    fonts: [],
    root: host,
  };
}

function chipHost(d: LayoutDoc): StackNode {
  const node = inferScreen(d, "s").root;
  if (node.kind !== "stack") throw new Error("Expected wrapping stack");
  return node;
}

describe("intrinsic chip wrapping", () => {
  const chips = () => [chip("a", 0, 0), chip("b", 70, 0), chip("c", 0, 38)];

  test("hugging chips with the default flex-shrink reflow natively", () => {
    const node = chipHost(chipDoc(chips()));
    expect(node.wrap).toBeDefined();
    expect(node.measured).toBeUndefined();
    expect(node.children.map((c) => c.width.kind)).toEqual(["hug", "hug", "hug"]);
  });

  test("equal-height chips in a stretching host still reflow", () => {
    const node = chipHost(chipDoc(chips(), { "align-items": "normal" }));
    expect(node.wrap).toBeDefined();
    expect(node.measured).toBeUndefined();
  });

  test("a chip that fills its line may have been shrunk, so it falls back", () => {
    const node = chipHost(chipDoc([chip("a", 0, 0, 180)], {}));
    expect(node.wrap).toBeUndefined();
    expect(node.diagnostics.map((d) => d.message).join(" ")).toContain("shrink");
  });

  test("app mode lets chips size themselves; fidelity pins their captured boxes", () => {
    const d = chipDoc(chips());
    const app = compileLayout(d, { name: "Chips", mode: "app" }).code;
    expect(app).toContain("MarkswiftFlow(");
    expect(app).not.toContain(".frame(width: 60.0, height: 28.0, alignment: .topLeading)");
    expect(compileLayout(d, { name: "Chips", mode: "fidelity" }).code).toContain(
      ".frame(width: 60.0, height: 28.0, alignment: .topLeading)",
    );
  });
});
