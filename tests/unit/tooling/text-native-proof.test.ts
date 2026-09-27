import { expect, test } from "bun:test";
import { checkTextNativeGeometry } from "../../../tools/verify/text-native-checks.ts";
import type { TextNativeReference } from "../../../tools/verify/text-native-fixtures.ts";

const reference: TextNativeReference = { id: "h2", viewport: 320, width: 288, height: 24, first: 18,
  words: [{ text: "A", x: 0, y: 1, w: 12, h: 21 }, { text: "word", x: 16, y: 1, w: 40, h: 21 }] };

function log(delta = 0, missing = false, faultHeight = 48): string {
  const frames = [2, 3].flatMap(scale => reference.words.flatMap((word, index) => missing && index === 1 ? [] : [
    "WORD_FRAME " + JSON.stringify({ id: "h2", width: 288, scale, factor: 1, index, text: word.text,
      x: word.x + delta, y: word.y + 0.5, w: word.w, h: word.h, advance: word.w }),
  ]));
  return [...frames,
    "WORD_FRAME " + JSON.stringify({ id: "fault-h2", factor: 1.5 }),
    "LINE_BOX_PROOF " + JSON.stringify({ id: "fault-h2", mode: "app", width: 288, height: faultHeight }),
  ].join("\n");
}

test("native text verifier admits observed word geometry and requires an independently visible fault", () => {
  const result = checkTextNativeGeometry(log(), [reference]);
  expect(result.samples).toHaveLength(2);
  expect(result.maximum.x).toBe(0);
  expect(result.maximum.row).toBe(0);
  expect(result.fault).toEqual({ referenceHeight: 24, nativeHeight: 48, wordSamples: 1 });
});

test("native text verifier rejects absent word observations and wrong placement", () => {
  expect(() => checkTextNativeGeometry(log(0, true), [reference])).toThrow("Missing actual native word coverage");
  expect(() => checkTextNativeGeometry(log(8), [reference])).toThrow("Native words differ from Chrome");
});

test("native text verifier rejects a fault that leaves actual geometry unchanged", () => {
  expect(() => checkTextNativeGeometry(log(0, false, 24), [reference])).toThrow("Wrong native advance did not produce");
});
