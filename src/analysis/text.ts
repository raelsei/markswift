/** Construct semantic text nodes from measured inline runs. */
import { type LayoutNode } from "../model/layout.ts";
import { type TextNode, type SemBase } from "../model/semantic.ts";
import { parseDeclared } from "../css/index.ts";
import { type SourceTextRun, type InferenceContext } from "./context.ts";
import { makeBase } from "./node-base.ts";
import { buildTextRuns } from "./text-run-builder.ts";
import { finishTextNode } from "./text-node.ts";

/**
 * @param leaf  the host holds nothing but this text → its box is the CSS line box (text-node
 *              boxes from DOMSnapshot are glyph areas and overshoot tight line-heights).
 */
export function buildText(host: LayoutNode, runs: SourceTextRun[], ctx: InferenceContext, leaf = false): TextNode {
  // A leaf owns its element's box, padding and decoration. Runs grouped between flow children
  // are only the text: the host's decoration belongs to the host container.
  const base: SemBase = leaf
    ? makeBase(host, ctx, parseDeclared(host.attrs["style"]))
    : { id: host.id ? `${host.id}#text` : "", frame: host.bounds, width: { kind: "hug" }, height: { kind: "hug" }, padding: [0, 0, 0, 0], style: { fills: [], shadows: [] }, confidence: "mapped", notes: [], overlays: [] };
  const notes = base.notes;
  const noted: Record<string, true> = {};
  const note = (s: string) => {
    if (!noted[s]) notes.push(s);
    noted[s] = true;
  };
  return finishTextNode(host, runs, base, leaf, buildTextRuns(host, runs, ctx, note), note);
}
