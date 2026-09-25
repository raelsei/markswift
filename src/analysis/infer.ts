/** Layout tree traversal and semantic node dispatch. */
import type { LayoutDoc } from "../model/layout.ts";
import type { Screen } from "../model/semantic.ts";
import { parseColor } from "../css/index.ts";
import type { InferOptions, InferenceContext } from "./context.ts";
import { build } from "./infer-node.ts";
import { buildOverlays } from "./infer-overlays.ts";

export function inferScreen(doc: LayoutDoc, name: string, options: InferOptions = {}): Screen {
  const ctx: InferenceContext = { root: doc.root, fixed: [], bundledFamilies: options.bundledFamilies ?? {} };
  const root = build(doc.root, ctx);
  root.width = { kind: "fill" };
  root.height = { kind: "fill" };
  // Fixed-position nodes do not scroll with content: they overlay the screen, not their DOM parent.
  if (ctx.fixed.length) root.overlays.push(...buildOverlays(doc.root, ctx.fixed, undefined, ctx, build));
  const canvas = parseColor(doc.canvas) ?? { r: 1, g: 1, b: 1, a: 1 };
  return { version: 1, name, source: doc.source, theme: doc.combo.theme, size: doc.size, canvas, root };
}

export { fontOf } from "./typography.ts";
export { textPaintOf } from "./style.ts";
export type { InferOptions } from "./context.ts";
export type { BundledFamily } from "../model/fonts.ts";
