import { expect, test } from "bun:test";
import { controlOf } from "../../../src/analysis/controls.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

function radio(attrs: Record<string, string>, formOwner?: string): LayoutNode {
  return { tag: "input", attrs: { type: "radio", ...attrs }, formOwner, styles: {}, bounds: { x: 0, y: 0, w: 16, h: 16 }, children: [] };
}

test("radio analysis uses exact form/name pair and preserves empty submitted values", () => {
  expect(controlOf(radio({ name: "a", value: "" }, "form:1"))).toMatchObject({ radioGroup: '["form:1","a"]', value: "" });
  expect(controlOf(radio({ name: "" }, "form:1"))!.radioGroup).toBeUndefined();
  expect(controlOf(radio({}, "form:1"))!.value).toBe("on");
  expect(controlOf(radio({ name: " A " }, "tree:0"))!.radioGroup).not.toBe(controlOf(radio({ name: "a" }, "tree:0"))!.radioGroup);
});

test("legacy captures lacking actual form ownership diagnose independent named selection", () => {
  const spec = controlOf(radio({ name: "legacy" }))!;
  expect(spec.radioGroup).toBeUndefined();
  expect(spec.notes).toEqual([expect.stringContaining("recapture")]);
  expect(controlOf(radio({}))!.notes).toEqual([]);
});
