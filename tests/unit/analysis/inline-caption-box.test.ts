import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { inlineCaptionBoxHeight } from "../../../src/analysis/inline-caption-box.ts";
import { walk, type TextNode } from "../../../src/model/semantic.ts";
import { inlineContentFlowFixture } from "../../helpers/inline-content-flow-fixture.ts";

function capturedCaption(lines = 1) {
  const doc = inlineContentFlowFixture(), source = doc.root.children[0]!.children[1]!.children[1]!;
  let text: TextNode | undefined;
  walk(inferScreen(doc, "Caption").root, node => { if (node.kind === "text" && node.runs[0]?.text === "Include diagnostics") text = node; });
  if (!text?.lineBox) throw new Error("Fixture did not produce a measured caption");
  text.lines = lines;
  text.frame.h = source.bounds.h = 17 + (lines - 1) * 20;
  source.lines = Array.from({ length: lines }, (_, index) => ({
    bounds: { ...source.bounds, y: source.bounds.y + index * 20, h: 17 },
    start: index * 8, length: 8, baseline: source.bounds.y + 14 + index * 20,
  }));
  return { text, source };
}

test.each([1, 2, 3])("captured %s-line caption validates its font box without changing its runtime text", lines => {
  const { text, source } = capturedCaption(lines), before = JSON.stringify(text);
  expect(inlineCaptionBoxHeight(text, 20, source)).toBe(17);
  expect(JSON.stringify(text)).toBe(before);
});

test.each([NaN, Infinity, -Infinity])("nonfinite source metrics %s never admit a continuation", value => {
  for (const metric of ["height", "position", "baseline"] as const) {
    const { text, source } = capturedCaption(2), line = source.lines![1]!;
    if (metric === "height") line.bounds.h = value;
    if (metric === "position") line.bounds.y = value;
    if (metric === "baseline") line.baseline = value;
    expect(inlineCaptionBoxHeight(text, 20, source)).toBeUndefined();
  }
});

test.each(["missing-lines", "missing-baseline", "duplicate-line", "shifted-line", "wrong-height", "wrong-union", "wrong-step", "nonfinite-step", "nonfinite-frame", "nonfinite-line-height"])("unproved %s declines continuation", variant => {
  const { text, source } = capturedCaption(2);
  let lineHeight = 20;
  if (variant === "missing-lines") delete source.lines;
  if (variant === "missing-baseline") delete source.lines![1]!.baseline;
  if (variant === "duplicate-line") source.lines![1] = structuredClone(source.lines![0]!);
  if (variant === "shifted-line") source.lines![1]!.bounds.y += 1;
  if (variant === "wrong-height") source.lines![1]!.bounds.h += 1;
  if (variant === "wrong-union") text.frame.h += 1;
  if (variant === "wrong-step") text.lineBox!.baselineStep += 1;
  if (variant === "nonfinite-step") text.lineBox!.baselineStep = NaN;
  if (variant === "nonfinite-frame") text.frame.y = NaN;
  if (variant === "nonfinite-line-height") lineHeight = NaN;
  expect(inlineCaptionBoxHeight(text, lineHeight, source)).toBeUndefined();
});
