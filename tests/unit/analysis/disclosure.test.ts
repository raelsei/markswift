import { expect, test } from "bun:test";
import { controlOf, buildControl } from "../../../src/analysis/controls.ts";
import { makeBase } from "../../../src/analysis/node-base.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
const node = (tag: string, x: number, y: number, w: number, h: number): LayoutNode => ({ tag, attrs: {}, styles: { display: "block" }, bounds: { x, y, w, h }, children: [] });

test("disclosure measures nested CSS leading inset and vertical gap from captured boxes", () => {
  const details = node("details", 10, 10, 200, 100); details.attrs.open = "";
  details.children = [node("summary", 10, 10, 200, 20), node("details", 26, 42, 184, 24), node("details", 26, 78, 184, 24)];
  expect(controlOf(details)?.disclosureLayout).toEqual({ gap: 12, labelInset: 0, contentInset: 16, contentAvailable: true });
  details.children[0]!.bounds.x = 14;
  expect(controlOf(details)?.disclosureLayout?.labelInset).toBe(4);
});

test("unequal insets and overlapping/nonuniform captured flow stay on an explicitly diagnosed fallback", () => {
  const details = node("details", 10, 10, 200, 100); details.attrs.open = "";
  details.children = [node("summary", 10, 10, 200, 20), node("p", 26, 42, 184, 24), node("p", 30, 78, 180, 24)];
  expect(controlOf(details)?.disclosureLayout).toBeUndefined();
  expect(controlOf(details)?.notes.join("\n")).toContain("unequal/negative leading insets");
  details.children[2]!.bounds.x = 26; details.children[2]!.bounds.y = 50;
  expect(controlOf(details)?.disclosureLayout).toBeUndefined();
});

test("closed details never treats positive unpainted CDP descendant boxes as available native content", () => {
  const details = node("details", 10, 10, 200, 20);
  const summary = node("summary", 10, 10, 200, 20), hidden = node("section", 10, 40, 200, 80);
  details.children = [summary, hidden];
  const spec = controlOf(details)!, ctx = { root: details, fixed: [], bundledFamilies: {} };
  expect(spec.disclosureLayout?.contentAvailable).toBe(false);
  expect(spec.notes.join("\n")).toContain("no captured layout");
  const sem = { ...makeBase(hidden, ctx, {}), kind: "box" as const };
  const result = buildControl(spec, { base: makeBase(details, ctx, {}), children: [{ node: hidden, sem }], texts: [] });
  expect(result.content).toEqual([]);
});
