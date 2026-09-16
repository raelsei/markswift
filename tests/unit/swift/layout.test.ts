import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";
import { emitSwift } from "../../../src/swift/emit.ts";

function element(tag: string, x: number, y: number, w: number, h: number, styles: Record<string, string>, children: LayoutNode[] = []): LayoutNode {
  return { tag, attrs: {}, bounds: { x, y, w, h }, styles, children };
}
function measuredRow(intrinsic: boolean) {
  const tile = (x: number) => element("div", x, 0, 174, 90, { display: "block", position: "relative", "background-color": "rgb(85, 153, 187)" }, [
    element("div", x + 48, 25, 40, 40, { position: "absolute", "background-color": "rgb(238, 51, 68)" }),
  ]);
  const text: LayoutNode = { tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 174, h: 90 }, text: "Intrinsic text", children: [] };
  const root = element("main", 0, 0, 393, 90, { display: "block" }, [
    element("section", 0, 0, 360, 90, { display: "flex", "flex-direction": "row", "align-items": "stretch", gap: "12px" }, intrinsic ? [
      element("p", 0, 0, 174, 90, { display: "block", "font-size": "16px", "line-height": "90px" }, [text]), tile(186),
    ] : [tile(0), tile(186)]),
  ]);
  const doc: LayoutDoc = { version: 1, source: "layout-test", combo: { screen: "row", theme: "light", demoState: "normal" }, size: { w: 393, h: 90 }, dpr: 3, canvas: "rgb(255,255,255)", root };
  return inferScreen(doc, "row");
}

test("a measured-height row passes its height proposal to overlay-only stretch children", () => {
  const screen = measuredRow(false);
  expect(screen.root.kind).toBe("stack");
  if (screen.root.kind !== "stack") throw new Error("expected root stack");
  const row = screen.root.children[0]!;
  expect(row.height).toEqual({ kind: "fixed", px: 90 });
  if (row.kind !== "stack") throw new Error("expected row stack");
  expect(row.children.map(n => n.height.kind)).toEqual(["fill", "fill"]);
  for (const mode of ["app", "fidelity"] as const) {
    expect(emitSwift(screen, "RowView", { mode }).view).not.toContain(".fixedSize(horizontal: false, vertical: true)");
  }
});

test("a content-height row still measures its intrinsic content with stretch children", () => {
  const screen = measuredRow(true);
  if (screen.root.kind !== "stack") throw new Error("expected root stack");
  const row = screen.root.children[0]!;
  expect(row.height.kind).toBe("hug");
  for (const mode of ["app", "fidelity"] as const) {
    const swift = emitSwift(screen, "RowView", { mode }).view;
    expect(swift).toMatch(/HStack\([\s\S]*?\n\s*}\n\s*\.fixedSize\(horizontal: false, vertical: true\)/);
  }
});

// A fill-height row also receives a meaningful proposal from its parent.
test("a fill-height row keeps its parent's height proposal", () => {
  const screen = measuredRow(false);
  if (screen.root.kind !== "stack") throw new Error("expected root stack");
  const row = screen.root.children[0]!;
  row.height = { kind: "fill" };
  for (const mode of ["app", "fidelity"] as const) {
    expect(emitSwift(screen, "RowView", { mode }).view).not.toContain(".fixedSize(horizontal: false, vertical: true)");
  }
});
