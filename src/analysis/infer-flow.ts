import type { LayoutNode } from "../model/layout.ts";
import type { Axis, SemBase, StackNode } from "../model/semantic.ts";
import type { AnalyzedChild } from "./context.ts";
import { linesOf, stackOf } from "./flow-layout.ts";
import { buildWrapping } from "./wrapping.ts";
import { crossAlign, distributionOf } from "./alignment.ts";
import { unionRect } from "./geometry.ts";
import { finish } from "./node-base.ts";

/** Build a grid-free flow stack and decide whether measured overflow needs scrolling. */
export function buildFlowStack(n: LayoutNode, base: SemBase, items: AnalyzedChild[], axis: Axis, display: string): StackNode {
  const notes = base.notes;
  const align = crossAlign(n, axis);
  const distribution = distributionOf(n.styles["justify-content"], display);
  // Ordinary float/inline-block lines become measured rows. Flex wrapping has its own native
  // reflow path and a captured-position fallback, including column and reverse wrapping.
  const wraps = /flex/.test(display) && /^(wrap|wrap-reverse)$/.test(n.styles["flex-wrap"] ?? "");
  const lines = axis === "h" ? [[...items].sort((a, b) => a.sem.frame.x - b.sem.frame.x)] : linesOf(items);
  let stack: StackNode;
  const multi = lines.some((l) => l.length > 1);
  if (wraps) {
    stack = buildWrapping(n, base, items, axis, align, distribution);
  } else if (multi && lines.length === 1 && axis === "v") {
    // One measured line of side-by-side blocks (table cells, inline-blocks, a float and its text).
    if (lines[0]!.some((i) => /^(left|right)$/.test(i.node.styles["float"] ?? ""))) notes.push("approximated: float → side-by-side row; text does not wrap around it");
    stack = stackOf(base, "h", lines[0]!, "start", "start");
  } else if (multi && lines.length > 1) {
    const floats = items.filter((i) => /^(left|right)$/.test(i.node.styles["float"] ?? ""));
    if (floats.length) notes.push("approximated: float → side-by-side row; text does not wrap around it");
    const rows: AnalyzedChild[] = lines.map((line, i) => {
      if (line.length === 1) return line[0]!;
      const u = line.map((it) => it.sem.frame).reduce(unionRect);
      const rowBase: SemBase = {
        id: base.id ? `${base.id}/row${i}` : "",
        frame: { x: n.bounds.x + base.padding[3], y: u.y, w: n.bounds.w - base.padding[1] - base.padding[3], h: u.h },
        width: { kind: "fill" },
        height: { kind: "hug" },
        padding: [0, 0, 0, 0],
        style: { fills: [], shadows: [] },
        confidence: "mapped",
        notes: [],
        overlays: [],
      };
      const row = finish(stackOf(rowBase, "h", line, "start", "start"));
      return { node: n, sem: row };
    });
    stack = stackOf(base, "v", rows, "stretch", "start");
  } else {
    stack = stackOf(base, axis, lines.flat(), align, distribution);
  }

  const items2 = stack.children;
  const oy = n.styles["overflow-y"];
  const ox = n.styles["overflow-x"];
  if (oy === "auto" || oy === "scroll") {
    const contentBottom = Math.max(...items2.map((i) => i.frame.y + i.frame.h), n.bounds.y);
    if (contentBottom > n.bounds.y + n.bounds.h + 0.5 || oy === "scroll") stack.scroll = "v";
  }
  if (!stack.scroll && (ox === "auto" || ox === "scroll")) {
    const contentRight = Math.max(...items2.map((i) => i.frame.x + i.frame.w), n.bounds.x);
    if (contentRight > n.bounds.x + n.bounds.w + 0.5 || ox === "scroll") stack.scroll = "h";
  }
  return stack;
}
