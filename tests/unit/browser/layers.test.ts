import { describe, expect, test } from "bun:test";
import { LAYOUT_DOC_VERSION, LayoutDoc, type LayoutNode } from "../../../src/model/layout.ts";

const node = (id: string, extra: Partial<LayoutNode> = {}): LayoutNode => ({
  id,
  tag: "div",
  attrs: {},
  styles: {},
  bounds: { x: 0, y: 0, w: 10, h: 10 },
  children: [],
  ...extra,
});

const doc = (layers: unknown) => ({
  version: LAYOUT_DOC_VERSION,
  source: "test",
  combo: { screen: "s", theme: "light" },
  size: { w: 390, h: 100 },
  viewport: { x: 0, y: 0, w: 390, h: 844 },
  dpr: 1,
  fonts: [],
  root: node("root", {
    children: [
      node("0", { tag: "button", states: { open: { "background-color": "rgb(240, 240, 240)" } } }),
      node("1", { tag: "dialog", pseudoStyles: { backdrop: { "background-color": "rgba(0, 0, 0, 0.4)" } } }),
    ],
  }),
  layers,
});

const layer = (id: string) => ({
  id,
  trigger: "0",
  activation: "click",
  relation: "aria-controls",
  modal: true,
  placement: "viewport",
  nodes: [node("edit-profile"), node("edit-profile/1")],
  dismiss: { escape: true, outside: false, buttons: ["#cancel"] },
});

describe("LayoutDoc 4 layers", () => {
  test("parses layers, states.open and pseudoStyles.backdrop", () => {
    const parsed = LayoutDoc.parse(doc([layer("edit-profile")]));
    expect(parsed.layers?.[0]?.nodes).toHaveLength(2);
    expect(parsed.layers?.[0]?.dismiss).toEqual({ escape: true, outside: false, buttons: ["#cancel"] });
    expect(parsed.root.children[0]?.states?.open).toEqual({ "background-color": "rgb(240, 240, 240)" });
    expect(parsed.root.children[1]?.pseudoStyles?.backdrop).toEqual({ "background-color": "rgba(0, 0, 0, 0.4)" });
  });

  test("rejects a layer id that is not a slug", () => {
    expect(() => LayoutDoc.parse(doc([layer("Edit Profile")]))).toThrow();
  });
});
