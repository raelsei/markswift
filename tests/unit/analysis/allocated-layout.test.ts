import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import type { GridNode, StackNode } from "../../../src/model/semantic.ts";

function capture(display: string, widths: number[], styles: Record<string, string>, childStyles: Record<string, string>[]): LayoutDoc {
  let x = 16;
  const children: LayoutNode[] = widths.map((w, i) => {
    const child: LayoutNode = { id: `cell${i}`, tag: "div", attrs: {}, children: [],
      preferredSize: { width: "auto", height: "40px" }, bounds: { x, y: 16, w, h: 40 },
      styles: { display: "block", "box-sizing": "border-box", "min-width": "0px", ...childStyles[i] } };
    x += w + 12;
    return child;
  });
  return { version: 1, source: "allocation.html", combo: { screen: "allocation", theme: "light", demoState: "normal" },
    size: { w: 390, h: 72 }, dpr: 1, canvas: "white", root: {
      id: "root", tag: "main", attrs: {}, preferredSize: { width: "auto", height: "auto" },
      styles: { display, "flex-direction": "row", "flex-wrap": "nowrap", "column-gap": "12px", "row-gap": "12px",
        "padding-left": "16px", "padding-right": "16px", "padding-top": "16px", "padding-bottom": "16px", ...styles },
      bounds: { x: 0, y: 0, w: 390, h: 72 }, children } };
}

test("a proven unequal flex row retains bases and factors for native allocation", () => {
  const input = capture("flex", [115.3333, 230.6667], {}, [
    { "flex-grow": "1", "flex-shrink": "1", "flex-basis": "40px" },
    { "flex-grow": "2", "flex-shrink": "1", "flex-basis": "80px" },
  ]);
  const node = inferScreen(input, "Flex").root as StackNode;
  expect(node.allocation?.tracks).toEqual([
    { basis: 40, grow: 1, shrink: 1, min: 0, inset: 0 },
    { basis: 80, grow: 2, shrink: 1, min: 0, inset: 0 },
  ]);
  expect(node.children.map(child => child.width.kind)).toEqual(["fill", "fill"]);
  expect(node.notes.some(note => note.includes("captured allocation"))).toBe(false);
  expect(node.children.flatMap(child => child.notes).some(note => note.includes("unequal flex-grow"))).toBe(false);
});

test("fixed and unequal fractional grid columns retain track intent", () => {
  const input = capture("grid", [80, 84.6667, 169.3333], {
    "grid-template-columns": "80px 84.6667px 169.3333px", "grid-template-rows": "40px", "grid-auto-flow": "row",
  }, [{}, {}, {}]);
  input.root.preferredSize = { width: "auto", height: "auto", gridTemplateColumns: "80px 1fr 2fr", gridTemplateRows: "auto" };
  const node = inferScreen(input, "Grid").root as GridNode;
  expect(node.tracks).toEqual([
    { basis: 80, grow: 0, shrink: 0, min: 80, max: 80 },
    { basis: 0, grow: 1, shrink: 0, min: 0 },
    { basis: 0, grow: 2, shrink: 0, min: 0 },
  ]);
  expect(node.measured?.frames.map(frame => frame.w)).toEqual([80, 84.67, 169.33]);
  expect(node.children.map(child => child.width.kind)).toEqual(["fill", "fill", "fill"]);
});

test("unproved automatic minimum and percentage flex bases retain captured allocation", () => {
  for (const constraint of [{ "min-width": "auto" }, { "flex-basis": "30%" }] as Record<string, string>[]) {
    const input = capture("flex", [115.3333, 230.6667], {}, [
      { "flex-grow": "1", "flex-shrink": "1", "flex-basis": "40px", ...constraint },
      { "flex-grow": "2", "flex-shrink": "1", "flex-basis": "80px" },
    ]);
    input.root.children[0]!.children = [{ tag: "#text", attrs: {}, styles: {}, text: "unbreakable-content", bounds: { x: 16, y: 16, w: 110, h: 20 }, children: [] }];
    const node = inferScreen(input, "Flex").root as StackNode;
    expect(node.allocation).toBeUndefined();
  }
});

test("native intrinsic centering stays bounded to one unconstrained auto-basis text item", () => {
  const intrinsic = () => {
    const input = capture("flex", [80], { "justify-content": "center", "align-items": "center" }, [
      { "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", "font-size": "16px", "line-height": "20px" },
    ]);
    const child = input.root.children[0]!;
    child.bounds.x = 155;
    child.children = [{ tag: "#text", attrs: {}, styles: {}, text: "Short label", bounds: { x: 155, y: 16, w: 80, h: 20 }, children: [] }];
    return input;
  };
  const native = inferScreen(intrinsic(), "Intrinsic").root as StackNode;
  expect(native.measured).toBeUndefined();
  expect(native.children[0]!.width.kind).toBe("hug");
  expect(native.notes.join(" ")).toContain("intrinsic flex text");
  const unsupported: Array<(input: LayoutDoc) => void> = [
    input => { input.root.children[0]!.styles["flex-basis"] = "0%"; },
    input => { input.root.children[0]!.styles["flex-shrink"] = "2"; },
    input => { input.root.children[0]!.styles["min-width"] = "10px"; },
    input => { input.root.children[0]!.styles["max-width"] = "200px"; },
    input => { input.root.children[0]!.preferredSize!.hasAutoMargins = true; },
    input => { input.root.styles["column-gap"] = "10%"; },
    input => { input.root.children[0]!.styles.position = "relative"; input.root.children[0]!.styles.left = "1px"; },
    input => { input.root.children.push(structuredClone(input.root.children[0]!)); },
  ];
  for (const change of unsupported) {
    const input = intrinsic();
    change(input);
    const node = inferScreen(input, "CapturedIntrinsic").root as StackNode;
    expect(node.measured).toBeDefined();
    expect(node.notes.join(" ")).toContain("flex captured allocation");
  }
});
