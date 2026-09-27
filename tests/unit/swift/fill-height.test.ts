import { expect, test } from "bun:test";
import { emittedFrame, frameNode } from "../../helpers/fill-height-probe.ts";

test("unconstrained semantic fill height accepts a smaller native proposal in both modes", () => {
  for (const mode of ["app", "fidelity"] as const) {
    expect(emittedFrame(frameNode(), mode)).toEqual([
      ".frame(minWidth: 0.0, maxWidth: .infinity, minHeight: 0.0, maxHeight: .infinity, alignment: .topLeading)",
    ]);
  }
});
test("fill height preserves explicit minima and the existing finite maximum frame", () => {
  for (const mode of ["app", "fidelity"] as const) {
    expect(emittedFrame(frameNode({ minHeight: 500 }), mode)[0]).toContain("minHeight: 500.0, maxHeight: .infinity");
    expect(emittedFrame(frameNode({ minHeight: 0 }), mode)[0]).toContain("minHeight: 0.0, maxHeight: .infinity");
    expect(emittedFrame(frameNode({ maxHeight: 300 }), mode)).toEqual([
      ".frame(minWidth: 0.0, maxWidth: .infinity, maxHeight: 300.0, alignment: .topLeading)",
    ]);
  }
});
test("implicit fill minimum does not alter fixed, hug, text floor or allocated-hug ownership", () => {
  const text = frameNode({ kind: "text", height: { kind: "hug" }, runs: [], lines: 1, align: "left" });
  const stack = { kind: "stack", axis: "v", align: "start", distribution: "start", spacing: 0, leadInset: 0, children: [text] };
  expect(emittedFrame(frameNode({ height: { kind: "fixed", px: 180 } }), "app")).toEqual([
    ".frame(height: 180.0)", ".frame(minWidth: 0.0, maxWidth: .infinity, alignment: .topLeading)",
  ]);
  expect(emittedFrame(frameNode({ height: { kind: "hug" } }), "app")).toEqual([
    ".frame(minWidth: 0.0, maxWidth: .infinity, alignment: .topLeading)",
  ]);
  expect(emittedFrame(frameNode({ ...stack, height: { kind: "fixed", px: 300 } }), "app")).toEqual([
    ".frame(minWidth: 0.0, maxWidth: .infinity, minHeight: 300.0, alignment: .topLeading)",
  ]);
  expect(emittedFrame(frameNode({ ...stack, axis: "h", height: { kind: "hug" }, allocation: { tracks: [] }, minHeight: 500, maxHeight: 550 }), "app")).toEqual([
    ".frame(minWidth: 0.0, maxWidth: .infinity, alignment: .topLeading)",
  ]);
});
