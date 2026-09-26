import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { equalWrapFixture } from "../../helpers/equal-wrap-fixture.ts";

test("equal calculated wrapping tracks retain live widths, min heights and gaps", () => {
  const node = inferScreen(equalWrapFixture(), "Cards").root;
  if (node.kind !== "stack") throw new Error("Expected tracks");
  expect(node.wrap).toEqual({ columnGap: 12, rowGap: 12, columns: 2 });
  expect(node.measured).toBeUndefined();
  for (const child of node.children) {
    expect(child.width).toEqual({ kind: "fill" });
    expect(child.height).toEqual({ kind: "fill" });
    expect(child.minHeight).toBe(96);
    expect(child.notes.some(note => note.includes("may not resize proportionally"))).toBe(false);
  }
});

test.each([
  ["unequal declaration", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.children[1]!.preferredSize!.width = "calc(40% - 6px)"; }],
  ["width constraint", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.children[0]!.styles["min-width"] = "160px"; }],
  ["growth", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.children[0]!.styles["flex-grow"] = "1"; }],
  ["content box", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.children[0]!.styles["box-sizing"] = "content-box"; }],
  ["explicit height", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.children[0]!.preferredSize!.height = "96px"; }],
  ["fixed host height", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.preferredSize!.height = "204px"; }],
  ["RTL", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.styles.direction = "rtl"; }],
  ["invalid gap identity", (doc: ReturnType<typeof equalWrapFixture>) => { doc.root.styles["column-gap"] = "10px"; }],
] as const)("equal track path rejects %s with a reflow diagnostic", (_, mutate) => {
  const doc = equalWrapFixture(); mutate(doc);
  const node = inferScreen(doc, "Cards").root;
  if (node.kind !== "stack") throw new Error("Expected tracks");
  expect(node.wrap?.columns).toBeUndefined();
  expect(node.measured).toBeDefined();
  expect(node.notes.join(" ")).toContain("cannot reflow");
});

test("app equal tracks measure live width while fidelity pins the independently captured frames", () => {
  const app = compileLayout(equalWrapFixture(), { name: "Cards", mode: "app" });
  expect(app.code).toContain("columns: 2, stretch: true");
  expect(app.code).not.toContain(".frame(width: 171.0");
  expect(app.files["MarkswiftRuntime.swift"]).toContain("subview.sizeThatFits(ProposedViewSize(width: columnWidth, height: nil))");
  const fidelity = compileLayout(equalWrapFixture(284), { name: "Cards", mode: "fidelity" });
  expect(fidelity.code).toContain(".frame(width: 136.0, height: 96.0");
  expect(fidelity.code).not.toContain("columns: 2");
});
