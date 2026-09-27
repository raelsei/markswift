import { expect, test } from "bun:test";
import type { LayoutNode } from "../../../src/model/layout.ts";
import { flowBounds, flowFrame, relativePosition } from "../../../src/analysis/relative-position.ts";
import { measuredLayoutOf } from "../../../src/analysis/measured-layout.ts";
import type { SemBase, SemNode } from "../../../src/model/semantic.ts";
import { buildOverlays } from "../../../src/analysis/infer-overlays.ts";

const node = (relativeInsets: [string, string, string, string], direction: "ltr" | "rtl" = "ltr"): LayoutNode => ({
  tag: "div", attrs: {}, styles: { position: "relative" }, bounds: { x: 28, y: 24, w: 100, h: 20 }, children: [],
  preferredSize: { width: "auto", height: "auto", relativeInsets, relativeContainingDirection: direction },
});

test("authored relative pixels use containing-block horizontal precedence and top priority", () => {
  expect(relativePosition(node(["8px", "auto", "auto", "12px"])).offset).toEqual([12, 8]);
  expect(relativePosition(node(["auto", "5px", "7px", "auto"])).offset).toEqual([-5, -7]);
  expect(relativePosition(node(["-4px", "20px", "99px", "10px"], "ltr")).offset).toEqual([10, -4]);
  expect(relativePosition(node(["-4px", "20px", "99px", "10px"], "rtl")).offset).toEqual([-20, -4]);
  expect(relativePosition(node(["auto", "auto", "auto", "auto"]))).toEqual({});
});

test("resolved percentage pixels and legacy captures do not establish responsive offsets", () => {
  const percent = node(["auto", "auto", "auto", "10%"]);
  percent.styles.left = "39px";
  expect(relativePosition(percent).reason).toContain("percentage or complex");
  percent.preferredSize!.relativeInsets = ["auto", "auto", "auto", "calc(10% + 2px)"];
  expect(relativePosition(percent).offset).toBeUndefined();
  delete percent.preferredSize!.relativeInsets;
  expect(relativePosition(percent).reason).toContain("unavailable");
  const ambiguous = node(["auto", "20px", "auto", "10px"]);
  delete ambiguous.preferredSize!.relativeContainingDirection;
  expect(relativePosition(ambiguous).reason).toContain("direction unavailable");
});

test("omitted legacy inset defaults preserve zero displacement without trusting computed zero pixels", () => {
  const legacy = node(["auto", "auto", "auto", "auto"]);
  delete legacy.preferredSize;
  expect(relativePosition(legacy)).toEqual({});
  legacy.styles.left = "0px";
  expect(relativePosition(legacy).reason).toContain("unavailable");
  delete legacy.styles.left;
  legacy.attrs.style = "inset-inline-start:calc(10% - 39px)";
  expect(relativePosition(legacy).reason).toContain("unavailable");
});

test("normal flow and measured placement subtract only a child's own paint offset", () => {
  const captured = node(["8px", "auto", "auto", "12px"]);
  expect(flowBounds(captured)).toEqual({ x: 16, y: 16, w: 100, h: 20 });
  const base: SemBase = { id: "parent", frame: { x: 16, y: 16, w: 200, h: 80 }, relativeOffset: [6, 4],
    width: { kind: "fill" }, height: { kind: "hug" }, padding: [0, 0, 0, 0],
    style: { fills: [], shadows: [] }, notes: [], confidence: "mapped", overlays: [] };
  const child: SemNode = { ...base, id: "child", kind: "box", frame: captured.bounds, relativeOffset: [12, 8] };
  const following: SemNode = { ...base, id: "following", kind: "box", frame: { x: 16, y: 40, w: 100, h: 20 }, relativeOffset: undefined };
  expect(measuredLayoutOf(base, [child, following]).frames).toEqual([
    { x: 0, y: 0, w: 100, h: 20 }, { x: 0, y: 24, w: 100, h: 20 },
  ]);
  expect(child.frame).toEqual(captured.bounds);
  expect(flowFrame(following)).toBe(following.frame);
});

test("a hanging relative child keeps its flow anchor separate from its painted displacement", () => {
  const child = node(["auto", "auto", "auto", "5px"]);
  child.styles.display = "block";
  child.bounds = { x: 15, y: 0, w: 20, h: 20 };
  const host: LayoutNode = { tag: "main", attrs: {}, styles: { "padding-left": "50px" },
    bounds: { x: 0, y: 0, w: 200, h: 60 }, children: [child] };
  const sem: SemNode = { kind: "box", id: "child", frame: child.bounds, relativeOffset: [5, 0],
    width: { kind: "fixed", px: 20 }, height: { kind: "fixed", px: 20 }, padding: [0, 0, 0, 0],
    style: { fills: [], shadows: [] }, notes: [], confidence: "mapped", overlays: [] };
  const overlays = buildOverlays(host, [], undefined, { root: host, fixed: [], bundledFamilies: {} }, () => sem);
  expect(overlays).toHaveLength(1);
  expect(overlays[0]!.offset).toEqual([10, 0]);
  expect(overlays[0]!.offset[0] + sem.relativeOffset![0]).toBe(child.bounds.x);
  expect(sem.frame).toBe(child.bounds);
});
