import { expect, test } from "bun:test";
import { makeBase } from "../../../src/analysis/node-base.ts";
import { fieldsetAdmission } from "../../../src/analysis/fieldset-paint.ts";
import { styleOf } from "../../../src/analysis/style.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";

function node(tag: string, id: string, width = 100, height = 20): LayoutNode {
  return { tag, id, attrs: {}, styles: { display: "block" }, bounds: { x: 10, y: 10, w: width, h: height }, children: [] };
}
function panel() {
  const fieldset = node("fieldset", "#fieldset", 300, 120), legend = node("legend", "#legend");
  fieldset.styles["background-color"] = "rgba(20, 40, 60, 0.5)";
  for (const edge of ["top", "right", "bottom", "left"]) Object.assign(fieldset.styles, {
    [`border-${edge}-width`]: "2px", [`border-${edge}-style`]: "solid", [`border-${edge}-color`]: "rgb(10, 30, 50)",
  });
  fieldset.children = [legend, node("p", "#content", 260, 40)];
  return { fieldset, legend };
}
const admission = (node: LayoutNode) => fieldsetAdmission(node, styleOf(node, []));

test("fieldset records direct rendered legend anchors without changing captured content geometry", () => {
  const { fieldset, legend } = panel(), before = JSON.stringify(fieldset);
  const ctx = { root: fieldset, fixed: [], bundledFamilies: {} };
  const base = makeBase(fieldset, ctx, {}), label = makeBase(legend, { ...ctx, parent: fieldset }, {});
  expect(base.fieldsetPaint).toEqual({ key: "fieldset:root", legendId: "#legend" });
  expect(label.fieldsetLegend).toEqual({ key: "fieldset:root", relativeOffset: [0, 0] });
  expect(base.frame).toBe(fieldset.bounds);
  expect(JSON.stringify(fieldset)).toBe(before);
  const nested = node("fieldset", "#fieldset", 100, 80); nested.children = [node("legend", "#legend")];
  fieldset.children.push(nested);
  expect(makeBase(nested, { ...ctx, parent: fieldset }, {}).fieldsetPaint?.key).toBe("fieldset:root/2");
});

test("first display-none legend is skipped; relative paint displacement is separately proved", () => {
  const { fieldset, legend } = panel(), hidden = node("legend", "#hidden"); hidden.styles.display = "none";
  fieldset.children.unshift(hidden);
  expect(admission(fieldset).legend).toBe(legend);
  legend.styles.position = "relative";
  legend.preferredSize = { width: "auto", height: "auto", relativeInsets: ["4px", "auto", "auto", "7px"] };
  const ctx = { root: fieldset, fixed: [], bundledFamilies: {}, parent: fieldset };
  expect(makeBase(legend, ctx, {}).fieldsetLegend?.relativeOffset).toEqual([7, 4]);
  legend.preferredSize.relativeInsets = ["10%", "auto", "auto", "7px"];
  expect(admission(fieldset).reason).toContain("not fixed-pixel proved");
});

test("visible geometry without paint still reserves a visibility-hidden legend cutout", () => {
  const { fieldset, legend } = panel(); legend.styles.visibility = "hidden";
  expect(admission(fieldset).legend).toBe(legend);
});

test("unsupported fieldset decorations are explicit fallbacks with no native anchor contract", () => {
  const variants: Array<[string, (fieldset: LayoutNode, legend: LayoutNode) => void]> = [
    ["floated/absolute", (_, legend) => { legend.styles.float = "left"; }],
    ["floated/absolute", (_, legend) => { legend.styles.position = "absolute"; }],
    ["vertical", fieldset => { fieldset.styles["writing-mode"] = "vertical-rl"; }],
    ["complex fieldset fill", fieldset => { fieldset.styles["background-image"] = "linear-gradient(red, blue)"; }],
    ["complex fieldset effect", fieldset => { fieldset.styles["box-shadow"] = "2px 3px 4px black"; }],
    ["nonuniform", fieldset => { fieldset.styles["border-right-width"] = "4px"; }],
    ["nonsolid", fieldset => { for (const edge of ["top", "right", "bottom", "left"]) fieldset.styles[`border-${edge}-style`] = "double"; }],
    ["percentage", fieldset => { fieldset.styles["border-top-left-radius"] = "50%"; }],
    ["inline-collapsed", (_, legend) => { legend.styles.display = "inline"; }],
    ["geometry unavailable", (_, legend) => { legend.bounds.h = 0; }],
    ["transformed legend", (_, legend) => { legend.styles.transform = "translateX(4px)"; }],
  ];
  for (const [reason, edit] of variants) {
    const { fieldset, legend } = panel(); edit(fieldset, legend);
    const base = makeBase(fieldset, { root: fieldset, fixed: [], bundledFamilies: {} }, {});
    expect(base.fieldsetPaint, reason).toBeUndefined();
    expect(base.notes.join(" ")).toContain(reason);
  }
});
