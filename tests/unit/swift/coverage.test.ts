import { expect, test } from "bun:test";
import type { BoxNode, ControlNode, Screen, SemBase, StackNode } from "../../../src/model/semantic.ts";
import { emitSwift } from "../../../src/swift/emit.ts";

function base(id: string): SemBase {
  return {
    id, frame: { x: 0, y: 0, w: 100, h: 40 },
    width: { kind: "fixed", px: 100 }, height: { kind: "fixed", px: 40 },
    padding: [0, 0, 0, 0], style: { fills: [], shadows: [] },
    confidence: "mapped", notes: [], overlays: [],
  };
}

test("node mapping counts emitted control labels and overlays after emit-time downgrades", () => {
  const label: BoxNode = { ...base("label"), kind: "box", confidence: "unmapped", notes: ["unmapped: label behavior"] };
  const control: ControlNode = { ...base("button"), kind: "control", control: "button", label, content: [] };
  const invert: BoxNode = { ...base("invert"), kind: "box", style: { fills: [], shadows: [], filters: [{ kind: "invert", amount: 0.4 }] } };
  const overlay: BoxNode = { ...base("overlay"), kind: "box" };
  const root: StackNode = {
    ...base("root"), kind: "stack", axis: "v", spacing: 0, align: "start",
    distribution: "start", leadInset: 0, children: [control, invert],
    overlays: [{ node: overlay, layer: "overlay", offset: [0, 0], covers: true }],
  };
  const screen: Screen = {
    version: 1, name: "test", source: "test.html", theme: "light", size: { w: 100, h: 40 },
    canvas: { r: 1, g: 1, b: 1, a: 1 }, root,
  };

  const result = emitSwift(screen, "TestView", { mode: "app" });
  expect(result.mapping).toEqual({ total: 5, mapped: 3, approximated: 1, unmapped: 1 });
  expect(result.report).toEqual([
    { id: "label", kind: "box", confidence: "unmapped", notes: ["unmapped: label behavior"] },
    { id: "invert", kind: "box", confidence: "approximated", notes: ["approximated: filter invert(0.4) is all-or-nothing on iOS"] },
  ]);
});
