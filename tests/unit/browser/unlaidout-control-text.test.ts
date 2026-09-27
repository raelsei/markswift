import { expect, test } from "bun:test";
import { unlaidOutControlTextWarnings } from "../../../src/browser/unlaidout-control-text.ts";
import type { TextSourceCapture, TextSourceOccurrence } from "../../../src/model/text-source.ts";

function occurrence(raw: string, overrides: Partial<TextSourceOccurrence> = {}): TextSourceOccurrence {
  return { key: "dom:/0", kind: "text", raw, origin: "dom", join: "verified", layoutPresent: false,
    ancestors: [{ key: "dom:/", tag: "main", display: "block" }], ...overrides };
}
function capture(...occurrences: TextSourceOccurrence[]): TextSourceCapture {
  return { version: 1, trust: "converter-capture-claim", root: { key: "dom:/", type: 1, tag: "main", externalAncestors: [] }, occurrences, unavailable: [] };
}

test("verified unlaid-out control sources produce an explicit limitation without changing their ledger", () => {
  const source = capture(occurrence("\f\f\v\u0085"));
  const before = structuredClone(source);
  expect(unlaidOutControlTextWarnings(source)).toEqual([
    "Source text dom:/0 contains U+000C, U+000B, U+0085 without a measured text layout; its raw source is retained, native control-glyph rendering remains unproved",
  ]);
  expect(source).toEqual(before);
});

test("ordinary document whitespace, Unicode spaces, and empty text need no control warning", () => {
  expect(unlaidOutControlTextWarnings(capture(occurrence(" \t\r\n\u00a0\u2003"), occurrence("")))).toEqual([]);
  expect(unlaidOutControlTextWarnings(undefined)).toEqual([]);
});

test("laid-out, generated, unavailable, and non-text occurrences do not claim this source disposition", () => {
  const source = capture(occurrence("\f", { layoutPresent: true }), occurrence("\f", { origin: "generated" }),
    occurrence("\f", { join: "unavailable" }), occurrence("\f", { kind: "br" }));
  expect(unlaidOutControlTextWarnings(source)).toEqual([]);
});

test("hidden and non-rendering content does not add a visible text limitation", () => {
  const sources = ["script", "style", "template", "noscript"].map(tag => occurrence("\f", { ancestors: [{ key: "dom:/", tag, display: "block" }] }));
  sources.push(occurrence("\f", { ancestors: [{ key: "dom:/", tag: "main", display: "none" }] }));
  expect(unlaidOutControlTextWarnings(capture(...sources))).toEqual([]);
});
