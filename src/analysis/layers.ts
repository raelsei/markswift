/** App mode: closed in-flow layers (`<details>`, collapsibles, accordion items) become content behind the screen's state. */
import { type LayoutDoc, type LayoutNode } from "../model/layout.ts";
import { type Screen, type SemNode, addDiagnostic, confidenceOf, walk } from "../model/semantic.ts";
import { round2 } from "../css/index.ts";
import { type InferOptions } from "./context.ts";
import { buildDetached } from "./infer.ts";

const REASON = {
  container: "its container is a measured, wrapping, flex or grid layout",
  stack: "its container is not a stack",
  trigger: "the trigger is not a button",
  sibling: "no stable sibling to insert after",
} as const;

/**
 * Each `inflow` layer of `doc`: a `<details>` gets the content and `opens`; anything else inserts the content into its
 * plain parent stack after its rest predecessor (`shownBy`), and the trigger Button `opens` it. Skips are reported.
 */
// ponytail: content goes into plain stacks only; measured/flex/grid parents report and keep today's output.
export function applyLayers(screen: Screen, doc: LayoutDoc, options: InferOptions = {}): void {
  const layers = doc.layers?.filter((l) => l.placement === "inflow") ?? [];
  if (!layers.length) return;
  const rest = new Map<string, LayoutNode>();
  const index = (n: LayoutNode) => {
    if (n.id !== undefined) rest.set(n.id, n);
    n.children.forEach(index);
  };
  index(doc.root);
  const sem = new Map<string, SemNode>();
  walk(screen.root, (n) => {
    if (n.id && !sem.has(n.id)) sem.set(n.id, n);
  });
  for (const layer of layers) {
    const feature = layer.relation === "details" ? "details" : "@aria-*";
    const parentLayout = layer.parent !== undefined ? rest.get(layer.parent) : undefined;
    const parent = layer.parent !== undefined ? sem.get(layer.parent) : undefined;
    const trigger = sem.get(layer.trigger);
    const report = (at: SemNode | undefined, message: string) => {
      const n = at ?? screen.root;
      addDiagnostic(n.diagnostics, "approximated", feature, message);
      n.confidence = confidenceOf(n.diagnostics);
    };
    const skip = (reason: string) =>
      report(parent ?? trigger, `content shown by ${layer.id} is not emitted: ${reason}`);
    const content = () => {
      const built = layer.nodes.map((node) => buildDetached(node, parentLayout!, doc, options));
      if (built.some((b) => b.fixed))
        report(parent, `a position: fixed descendant of the content shown by ${layer.id} is not emitted`);
      return built.map((b) => b.sem);
    };
    if (!parentLayout || !parent) {
      skip(REASON.sibling);
      continue;
    }
    if (layer.relation === "details") {
      if (parent.kind !== "control" || parent.control !== "disclosure") {
        skip(REASON.trigger);
        continue;
      }
      parent.content.push(...content());
      parent.opens = { layer: layer.id, kind: "inflow" };
      continue;
    }
    if (!trigger?.action) {
      skip(REASON.trigger);
      continue;
    }
    if (parent.kind !== "stack" && parent.kind !== "grid") {
      skip(REASON.stack);
      continue;
    }
    if (parent.kind === "grid" || parent.measured || parent.wrap || parent.flex) {
      skip(REASON.container);
      continue;
    }
    const k = layer.index ?? -1;
    const predId = k > 0 ? parentLayout.children[k - 1]?.id : undefined;
    const p = predId !== undefined ? parent.children.findIndex((c) => c.id === predId) + 1 : 0;
    // k = 0: the content becomes the first child, so it must not take an edge the old first child had.
    const first =
      k === 0 &&
      typeof parent.spacing === "number" &&
      parent.leadInset === 0 &&
      !parent.autoGaps?.length &&
      parent.distribution !== "between";
    if (k < 0 || (k > 0 && p === 0) || (k === 0 && !first)) {
      skip(REASON.sibling);
      continue;
    }
    const nodes = content();
    for (const n of nodes) n.shownBy = layer.id;
    // One gap per inserted node from the measured open geometry; the old pred → next gap stays after the last one.
    const v = parent.axis === "v";
    const gaps =
      p > 0
        ? nodes.map((n, i) => {
            const prev = i ? nodes[i - 1]! : parent.children[p - 1]!;
            return round2(v ? n.frame.y - prev.frame.y - prev.frame.h : n.frame.x - prev.frame.x - prev.frame.w);
          })
        : [];
    if (typeof parent.spacing === "number") {
      const s = parent.spacing;
      if (gaps.some((g) => Math.abs(g - s) > 0.5))
        parent.spacing = Array.from({ length: Math.max(0, parent.children.length - 1) }, () => s);
    }
    if (Array.isArray(parent.spacing)) parent.spacing.splice(p - 1, 0, ...gaps);
    if (parent.autoGaps) parent.autoGaps = parent.autoGaps.map((g) => (g >= p ? g + nodes.length : g));
    parent.children.splice(p, 0, ...nodes);
    trigger.opens = { layer: layer.id, kind: "inflow" };
  }
}
