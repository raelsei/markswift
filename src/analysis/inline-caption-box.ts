import type { TextNode } from "../model/semantic.ts";
import type { LayoutNode } from "../model/layout.ts";
import { flowFrame } from "./relative-position.ts";

/** Validate the captured plain font-box union; its soft lines never enter the runtime plan. */
export function inlineCaptionBoxHeight(text: TextNode, lineHeight: number, source: LayoutNode): number | undefined {
  const box = text.lineBox;
  if (!box || !Number.isSafeInteger(text.lines) || text.lines < 1 || source.lines?.length !== text.lines) return;
  const height = box.firstBaseline + box.baselineToBottom, frame = flowFrame(text);
  if (![height, box.baselineStep].every(value => Number.isFinite(value) && value > 0)
    || ![lineHeight, frame.y, frame.h].every(Number.isFinite) || lineHeight <= 0
    || Math.abs(box.baselineStep - lineHeight) > .5
    || Math.abs(frame.h - height - (text.lines - 1) * box.baselineStep) > .5) return;
  if (source.lines.some((line, index) => ![line.bounds.h, line.bounds.y, line.baseline].every(value => typeof value === "number" && Number.isFinite(value))
    || Math.abs(line.bounds.h - height) > .5
    || Math.abs(line.bounds.y - frame.y - index * box.baselineStep) > .5
    || line.baseline === undefined || Math.abs(line.baseline - frame.y - box.firstBaseline - index * box.baselineStep) > .5)) return;
  return height;
}
