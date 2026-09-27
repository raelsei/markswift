import type { TextNativeReference } from "./text-native-fixtures.ts";

interface WordFrame {
  id: string; width: number; scale: number; factor: number; index: number; text: string;
  x: number; y: number; w: number; h: number; advance: number;
}
interface LineBox { id: string; mode: string; width: number; scale: number; height: number; firstBaseline: number }

/** Verify final native samples; neither planned placement nor browser metadata is a native observation. */
export function checkTextNativeGeometry(log: string, references: TextNativeReference[]) {
  const words = [...log.matchAll(/WORD_FRAME (\{[^\n]+\})/g)].map(match => JSON.parse(match[1]!) as WordFrame);
  const lines = [...log.matchAll(/LINE_BOX_PROOF (\{[^\n]+\})/g)].map(match => JSON.parse(match[1]!) as LineBox);
  const samples = [];
  for (const reference of references) for (const scale of [2, 3]) {
    const final = new Map<number, WordFrame>();
    for (const frame of words) if (frame.id === reference.id && frame.width === reference.width && frame.scale === scale && frame.factor === 1) final.set(frame.index, frame);
    if (final.size !== reference.words.length) throw new Error(`Missing actual native word coverage: ${reference.id}/${reference.viewport}/${scale} (${final.size}/${reference.words.length})`);
    let maxX = 0, maxWidth = 0, maxAdvance = 0, maxRow = 0;
    const first = final.get(0)!;
    for (const [index, expected] of reference.words.entries()) {
      const actual = final.get(index);
      if (!actual || actual.text !== expected.text) throw new Error(`Native word identity mismatch: ${reference.id}/${index}`);
      if (![actual.x, actual.y, actual.w, actual.h, actual.advance].every(Number.isFinite)) throw new Error("Nonfinite native word geometry");
      maxX = Math.max(maxX, Math.abs(actual.x - expected.x));
      maxWidth = Math.max(maxWidth, Math.abs(actual.w - expected.w));
      maxAdvance = Math.max(maxAdvance, Math.abs(actual.advance - expected.w));
      maxRow = Math.max(maxRow, Math.abs(actual.y - first.y - expected.y + reference.words[0]!.y));
    }
    // Word views may round their outer glyph box to a display pixel. Fractional advances remain unrounded.
    if (maxX > 0.51 || maxWidth > 0.51 || maxAdvance > 0.1 || maxRow > 0.001) throw new Error(`Native words differ from Chrome: ${reference.id}/${reference.viewport}/${scale} ${JSON.stringify({ maxX, maxWidth, maxAdvance, maxRow })}`);
    samples.push({ id: reference.id, viewport: reference.viewport, scale, count: final.size, maxX, maxWidth, maxAdvance, maxRow });
  }
  const faultReference = references.find(reference => reference.id === "h2" && reference.viewport === 320)!;
  const fault = lines.findLast(line => line.id === "fault-h2" && line.mode === "app" && line.width === faultReference.width);
  const faultyWords = words.filter(frame => frame.id === "fault-h2" && frame.factor === 1.5);
  if (!fault || Math.abs(fault.height - faultReference.height) < 1 || faultyWords.length === 0) throw new Error("Wrong native advance did not produce an independently observable geometry fault");
  return { samples, fault: { referenceHeight: faultReference.height, nativeHeight: fault.height, wordSamples: faultyWords.length },
    maximum: { x: Math.max(...samples.map(sample => sample.maxX)), width: Math.max(...samples.map(sample => sample.maxWidth)),
      advance: Math.max(...samples.map(sample => sample.maxAdvance)), row: Math.max(...samples.map(sample => sample.maxRow)) } };
}
