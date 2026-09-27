import { expect, test } from "bun:test";
import { readSourceContentVisibility, attachSourceContentVisibility, contentVisibilityWarnings } from "../../../src/browser/content-visibility.ts";
import { snapshotToTree, toLayout } from "../../../src/browser/snapshot.ts";
import type { DomSnapshot } from "../../../src/browser/snapshot-types.ts";

function snapshot(ids = [10, 20], nodeIndex = [0, 1]): DomSnapshot {
  return { strings: ["http://test/", "HTML", "LABEL", "", "visible", "auto"], documents: [{ documentURL: 0,
    nodes: { backendNodeId: ids, nodeType: [1, 1], nodeName: [1, 2], nodeValue: [3, 3], parentIndex: [-1, 0], attributes: [[], []] },
    layout: { nodeIndex, styles: nodeIndex.map(index => [index === 0 ? 4 : 5]), bounds: nodeIndex.map(() => [0, 0, 100, 20]), text: nodeIndex.map(() => 3) },
    textBoxes: { layoutIndex: [], bounds: [], start: [], length: [] } }] };
}

test("origin joins survive decoding and layout conversion without altering captured style", () => {
  const original = readSourceContentVisibility(snapshot()), current = snapshotToTree(snapshot());
  current.children[0]!.styles["content-visibility"] = "visible";
  attachSourceContentVisibility(current, original);
  const layout = toLayout(current, { x: 0, y: 0 }, (_tag, _attrs, path) => path)!;
  expect(layout.sourceContentVisibility).toBe("visible");
  expect(layout.children[0]?.sourceContentVisibility).toBe("auto");
  expect(layout.children[0]?.styles["content-visibility"]).toBe("visible");
});

test("replacement, missing backend IDs and pre-settle unlaid-out source stay unknown", () => {
  for (const [before, after] of [[snapshot(), snapshot([10, 21])], [snapshot([10]), snapshot()], [snapshot([10, 20], [0]), snapshot()]] as const) {
    const tree = snapshotToTree(after);
    attachSourceContentVisibility(tree, readSourceContentVisibility(before));
    expect(tree.sourceContentVisibility).toBe("visible");
    expect(tree.children[0]?.sourceContentVisibility).toBeUndefined();
  }
});

test("duplicate identities in either snapshot and changed node names cannot authorize origin", () => {
  for (const [before, after] of [[snapshot([20, 20]), snapshot()], [snapshot(), snapshot([20, 20])]] as const) {
    const tree = snapshotToTree(after); attachSourceContentVisibility(tree, readSourceContentVisibility(before));
    expect(tree.children[0]?.sourceContentVisibility).toBeUndefined();
  }
  const tree = snapshotToTree(snapshot()); tree.children[0]!.name = "div";
  attachSourceContentVisibility(tree, readSourceContentVisibility(snapshot()));
  expect(tree.children[0]?.sourceContentVisibility).toBeUndefined();
});

test("actual forced DOM identities override a stale visible origin without transferring to replacements", () => {
  const source = new Map([[20, { name: "label", value: "visible" }]]);
  const forced = new Map([[20, { name: "label", value: "auto" }]]);
  const tree = snapshotToTree(snapshot());
  attachSourceContentVisibility(tree, source, forced);
  expect(tree.children[0]?.sourceContentVisibility).toBe("auto");
  expect(contentVisibilityWarnings(tree)).toHaveLength(1);
  for (const current of [snapshot([10, 21]), snapshot([20, 20])]) {
    const replacement = snapshotToTree(current);
    attachSourceContentVisibility(replacement, source, forced);
    expect(replacement.children[0]?.sourceContentVisibility).toBeUndefined();
  }
  tree.children[0]!.name = "div";
  attachSourceContentVisibility(tree, source, forced);
  expect(tree.children[0]?.sourceContentVisibility).toBeUndefined();
});

test("an observed auto value alone does not claim that the converter forced its DOM object", () => {
  const tree = snapshotToTree(snapshot());
  attachSourceContentVisibility(tree, readSourceContentVisibility(snapshot()));
  expect(contentVisibilityWarnings(tree).join(" ")).not.toContain("was forced");
});
