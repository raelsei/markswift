import { expect, test } from "bun:test";
import { sizeOf } from "../../../src/analysis/sizing.ts";
import type { LayoutNode } from "../../../src/model/layout.ts";
import type { InferenceContext } from "../../../src/analysis/context.ts";

function sample(auto: [boolean, boolean], x: number, fixed = false) {
  const child: LayoutNode = { tag: "div", id: "#child", attrs: {}, styles: { display: "block", "margin-left": "0px", "margin-right": "0px" },
    preferredSize: { width: fixed ? "80px" : "max-content", height: "auto", horizontalAutoMargins: auto }, bounds: { x, y: 10, w: 80, h: 20 },
    children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x, y: 10, w: 80, h: 17 }, text: "Caption", children: [] }] };
  const parent: LayoutNode = { tag: "main", attrs: {}, styles: { display: "block", "padding-left": "10px", "padding-right": "10px" }, bounds: { x: 0, y: 0, w: 300, h: 100 }, children: [child] };
  const ctx: InferenceContext = { root: parent, parent, parentAxis: "v", parentDisplay: "block", parentAlign: "stretch", fixed: [], bundledFamilies: {} };
  return { child, ctx };
}
function sizing(child: LayoutNode, ctx: InferenceContext) { const notes: string[] = []; return { ...sizeOf(child, {}, ctx, notes), notes }; }

test("proved horizontal auto margins align both hugging and fixed painted boxes", () => {
  for (const fixed of [false, true]) {
    const center = sample([true, true], 110, fixed), right = sample([true, false], 210, fixed), left = sample([false, true], 10, fixed);
    expect(sizing(center.child, center.ctx).selfAlign).toBe("center");
    expect(sizing(right.child, right.ctx).selfAlign).toBe("end");
    expect(sizing(left.child, left.ctx).selfAlign).toBeUndefined();
    expect(sizing(center.child, center.ctx).width.kind).toBe(fixed ? "fixed" : "hug");
    center.child.styles["margin-left"] = "100px"; center.child.styles["margin-right"] = "100px";
    expect(sizing(center.child, center.ctx).width.kind).toBe(fixed ? "fixed" : "hug");
    expect(sizing(center.child, center.ctx).selfAlign).toBe("center");
  }
});

test("vertical-only auto margins and legacy axis-unknown booleans do not prove horizontal intent", () => {
  const { child, ctx } = sample([false, false], 110);
  child.preferredSize!.hasAutoMargins = true;
  expect(sizing(child, ctx).selfAlign).toBeUndefined();
  delete child.preferredSize!.horizontalAutoMargins;
  expect(sizing(child, ctx).selfAlign).toBeUndefined();
});

test("auto-margin alignment requires the captured static used position and ordinary flow", () => {
  const mismatch = sample([true, true], 10);
  expect(sizing(mismatch.child, mismatch.ctx).selfAlign).toBeUndefined();
  expect(sizing(mismatch.child, mismatch.ctx).notes.join(" ")).toContain("used position disagrees");
  for (const style of [{ position: "absolute" }, { float: "left" }, { direction: "rtl" }, { "writing-mode": "vertical-rl" }, { "margin-right": "9px" }]) {
    const { child, ctx } = sample([true, false], 210); Object.assign(child.styles, style);
    expect(sizing(child, ctx).selfAlign).toBeUndefined();
    expect(sizing(child, ctx).notes.join(" ")).toContain("horizontal auto margins");
  }
  const flex = sample([true, true], 110); flex.ctx.parentDisplay = "flex";
  expect(sizing(flex.child, flex.ctx).selfAlign).toBeUndefined();
});

test("relative paint is separate from proved auto allocation; intrinsic min-content floors survive", () => {
  const { child, ctx } = sample([true, true], 117);
  child.styles.position = "relative"; child.styles["min-width"] = "min-content";
  child.preferredSize!.relativeInsets = ["auto", "auto", "auto", "7px"];
  const result = sizing(child, ctx);
  expect(result.selfAlign).toBe("center");
  expect(result.minWidth).toBe(80);
  expect(result.notes.join(" ")).toContain("intrinsic/complex constraint");
});
