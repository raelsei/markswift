import { expect, test } from "bun:test";
import type { ChromeTextLedger } from "../../../tools/verify/text-ledger-model.ts";
import { textLedgerHash, utf16Hash } from "../../../tools/verify/text-ledger-chrome.ts";
import { compareTextSourceCapture, validateTextProjection, type TextEmissionProjection } from "../../../tools/verify/text-projection.ts";
import type { TextSourceCapture } from "../../../src/model/text-source.ts";

function ledger(values = ["same", "same"]): ChromeTextLedger {
  const occurrences = values.map((raw, index) => ({ key: `dom:/${index}`, kind: "text" as const, raw, rawUtf16Sha256: utf16Hash(raw),
    ancestors: [{ key: "dom:/", tag: "main", display: "block" }], styles: { "white-space-collapse": "preserve" },
    rendering: "visible" as const, suppression: [], unavailable: [], fragments: [], ranges: [] }));
  return { version: 1, contract: "live-dom-text-ledger-v1", observer: "independent-live-dom", hashEncoding: "utf16le", browserVersion: "unit-structural-observations",
    document: { url: "about:blank", mode: "CSS1Compat", htmlSha256: utf16Hash("original"), viewportWidth: 390, viewportHeight: 300, deviceScaleFactor: 2, theme: "light" },
    root: { key: "dom:/", type: 1, tag: "main", selector: "main", frame: { x: 0, y: 0, w: 390, h: 300 }, externalAncestors: [] },
    nodes: occurrences.map(source => ({ key: source.key, type: 3, name: "#text", raw: source.raw, ancestors: source.ancestors })), occurrences, unavailable: [] };
}
function copies(source: ChromeTextLedger): TextEmissionProjection[] {
  return source.occurrences.map((occurrence, index) => ({ key: `emit/${index}`, literal: occurrence.raw, literalUtf16Sha256: utf16Hash(occurrence.raw),
    source: { version: 1, units: [{ output: [0, occurrence.raw.length], operation: "copy", sources: [{ occurrence: occurrence.key, start: 0, end: occurrence.raw.length }] }], excluded: [], unavailable: [] } }));
}
function capture(source: ChromeTextLedger): TextSourceCapture {
  const { selector: _selector, frame: _frame, ...root } = source.root;
  return { version: 1, trust: "converter-capture-claim", root,
    occurrences: source.occurrences.map(occurrence => ({ key: occurrence.key, kind: occurrence.kind, raw: occurrence.raw,
      ancestors: occurrence.ancestors, origin: "dom", join: "verified", layoutPresent: true })), unavailable: [] };
}

test("exact ordered projection reports source accounting without claiming native glyph or paint acceptance", () => {
  const source = ledger(), result = validateTextProjection(source, copies(source), capture(source));
  expect(result.accounted).toBe(true); expect(result.classifiedUtf16Length).toBe(8);
  expect(result.ledgerSha256).toBe(textLedgerHash(source));
  expect(result.nativeCoverage).toBe("not-observed"); expect(result.paintAcceptance).toBe("not-evaluated");
});

test("missing whole occurrences, duplicate repeated words and reorder cannot cancel by equal counts", () => {
  const source = ledger(), emitted = copies(source);
  expect(validateTextProjection(source, emitted.slice(1)).accounted).toBe(false);
  const duplicate = structuredClone(emitted); duplicate[1]!.source.units[0]!.sources = structuredClone(duplicate[0]!.source.units[0]!.sources);
  expect(validateTextProjection(source, duplicate).failures.some(reason => reason.includes("overlapping"))).toBe(true);
  expect(validateTextProjection(source, emitted.toReversed()).failures.some(reason => reason.includes("reordered"))).toBe(true);
});

test("literal/input hash tampering, extra emitted ink and invalid output/source ranges reject", () => {
  const source = ledger(["thin"]), emitted = copies(source);
  emitted[0]!.literal = "tXhin"; emitted[0]!.literalUtf16Sha256 = utf16Hash("tXhin");
  expect(validateTextProjection(source, emitted).failures.some(reason => reason.includes("differs") || reason.includes("suffix"))).toBe(true);
  const forged = ledger(["thin"]); forged.occurrences[0]!.rawUtf16Sha256 = utf16Hash("different");
  expect(validateTextProjection(forged, copies(forged)).accounted).toBe(false);
  const invalid = copies(source); invalid[0]!.source.units[0]!.sources[0]!.end = 5;
  expect(validateTextProjection(source, invalid).failures.some(reason => reason.includes("invalid UTF16"))).toBe(true);
  const shifted = copies(source); shifted[0]!.source.units[0]!.output = [1, 4];
  expect(validateTextProjection(source, shifted).accounted).toBe(false);
});

test("visible text cannot be suppressed or reassigned as synthetic compensating ink", () => {
  const source = ledger(["word"]), emitted = copies(source);
  emitted[0]!.literal = ""; emitted[0]!.literalUtf16Sha256 = utf16Hash("");
  emitted[0]!.source.excluded = [{ operation: "suppressed", sources: emitted[0]!.source.units[0]!.sources }]; emitted[0]!.source.units = [];
  expect(validateTextProjection(source, emitted).failures.some(reason => reason.includes("suppression"))).toBe(true);
  const synthetic = copies(source); synthetic[0]!.source.units = [{ output: [0, 4], operation: "synthetic", sources: [], reason: "layout gap" }];
  expect(validateTextProjection(source, synthetic).failures.some(reason => reason.includes("layout-only"))).toBe(true);
});

test("browser-observed hidden source is accounted separately, never as native paint", () => {
  const source = ledger(["hidden"]); source.occurrences[0]!.rendering = "suppressed"; source.occurrences[0]!.suppression = ["display:none ancestor"];
  const emitted: TextEmissionProjection[] = [{ key: "omitted-hidden", literal: "", literalUtf16Sha256: utf16Hash(""),
    source: { version: 1, units: [], excluded: [{ operation: "suppressed", sources: [{ occurrence: "dom:/0", start: 0, end: 6 }] }], unavailable: [] } }];
  expect(validateTextProjection(source, emitted).accounted).toBe(true);
  expect(validateTextProjection(source, emitted).nativeCoverage).toBe("not-observed");
});

test("display:none and opacity:0 copies and hidden hard breaks cannot become rendered projection", () => {
  for (const reason of ["display:none ancestor", "opacity:0 ancestor"]) {
    const source = ledger(["hidden"]); source.occurrences[0]!.rendering = "suppressed"; source.occurrences[0]!.suppression = [reason];
    expect(validateTextProjection(source, copies(source)).failures.some(value => value.includes("suppressed occurrence emitted"))).toBe(true);
  }
  const source = ledger([""]); source.occurrences[0]!.kind = "br"; source.occurrences[0]!.rendering = "suppressed"; source.occurrences[0]!.suppression = ["display:none ancestor"];
  const emitted: TextEmissionProjection[] = [{ key: "hidden-break", literal: "\n", literalUtf16Sha256: utf16Hash("\n"), source: { version: 1,
    units: [{ output: [0, 1], operation: "source-break", sources: [], boundary: { kind: "br", owner: "dom:/0", ordinal: 0 } }], excluded: [], unavailable: [] } }];
  expect(validateTextProjection(source, emitted).failures.some(value => value.includes("suppressed break"))).toBe(true);
});

test("collapse/trim claims and collapsed copy spaces remain unavailable until independently proved", () => {
  const source = ledger(["a  b"]), emitted = copies(source); source.occurrences[0]!.styles["white-space-collapse"] = "collapse";
  expect(validateTextProjection(source, emitted).unavailable.length).toBeGreaterThan(0);
  emitted[0]!.source.units[0]!.operation = "collapse";
  expect(validateTextProjection(source, emitted).accounted).toBe(false);
  emitted[0]!.source.units = []; emitted[0]!.source.excluded = [{ operation: "trim", sources: [{ occurrence: "dom:/0", start: 0, end: 4 }] }];
  emitted[0]!.literal = ""; emitted[0]!.literalUtf16Sha256 = utf16Hash("");
  expect(validateTextProjection(source, emitted).unavailable.some(reason => reason.includes("trim"))).toBe(true);
  const formFeed = ledger(["a\fb"]); formFeed.occurrences[0]!.styles["white-space-collapse"] = "collapse";
  expect(validateTextProjection(formFeed, copies(formFeed)).unavailable.some(reason => reason.includes("whitespace"))).toBe(true);
});

test("empty text and hard/soft breaks require exact occurrence ownership", () => {
  const source = ledger(["", "", ""]); source.occurrences[1]!.kind = "br"; source.occurrences[2]!.kind = "wbr";
  const emitted = copies(source); emitted[1]!.literal = "\n"; emitted[1]!.literalUtf16Sha256 = utf16Hash("\n");
  emitted[1]!.source.units = [{ output: [0, 1], operation: "source-break", sources: [], boundary: { kind: "br", owner: "dom:/1", ordinal: 0 } }];
  emitted[2]!.source.units = [{ output: [0, 0], operation: "source-break", sources: [], boundary: { kind: "wbr", owner: "dom:/2", ordinal: 1 } }];
  expect(validateTextProjection(source, emitted).accounted).toBe(true);
  expect(validateTextProjection(source, emitted.slice(1)).accounted).toBe(false);
  const emptyCopy = copies(source); expect(validateTextProjection(source, emptyCopy).accounted).toBe(false);
  const duplicate = [...emitted, { ...emitted[0]!, key: "extra-empty" }]; expect(validateTextProjection(source, duplicate).accounted).toBe(false);
});

test("UTF16 intervals preserve astral code units; code-point-count ranges leave missing source", () => {
  const source = ledger(["A😀B"]), emitted = copies(source);
  expect(source.occurrences[0]!.raw.length).toBe(4); expect(validateTextProjection(source, emitted).accounted).toBe(true);
  emitted[0]!.source.units[0]!.sources[0]!.end = 3;
  expect(validateTextProjection(source, emitted).accounted).toBe(false);
});

test("a hard break cannot swallow a missing whole word or claim another source newline", () => {
  const source = ledger(["word", ""]); source.occurrences[1]!.kind = "br";
  const emitted: TextEmissionProjection[] = [{ key: "break", literal: "\n", literalUtf16Sha256: utf16Hash("\n"), source: { version: 1,
    units: [{ output: [0, 1], operation: "source-break", sources: [{ occurrence: "dom:/0", start: 0, end: 4 }], boundary: { kind: "br", owner: "dom:/1", ordinal: 0 } }], excluded: [], unavailable: [] } }];
  expect(validateTextProjection(source, emitted).failures.some(reason => reason.includes("cannot consume"))).toBe(true);
  const newline = ledger(["\n"]), newlineEmission = copies(newline);
  newlineEmission[0]!.source.units[0]!.operation = "source-break";
  newlineEmission[0]!.source.units[0]!.boundary = { kind: "source-newline", owner: "dom:/0", source: { occurrence: "dom:/0", start: 0, end: 1 }, ordinal: 0 };
  expect(validateTextProjection(newline, newlineEmission).accounted).toBe(true);
  newlineEmission[0]!.source.units[0]!.boundary!.source!.start = 1;
  expect(validateTextProjection(newline, newlineEmission).accounted).toBe(false);
});

test("a raw LF under normal/collapse CSS cannot be promoted into a source hard break", () => {
  const source = ledger(["\n"]), emitted = copies(source);
  source.occurrences[0]!.styles["white-space-collapse"] = "collapse"; source.occurrences[0]!.styles["white-space"] = "normal";
  emitted[0]!.source.units[0]!.operation = "source-break";
  emitted[0]!.source.units[0]!.boundary = { kind: "source-newline", owner: "dom:/0", source: { occurrence: "dom:/0", start: 0, end: 1 }, ordinal: 0 };
  expect(validateTextProjection(source, emitted).accounted).toBe(false);
  expect(validateTextProjection(source, emitted).unavailable.some(value => value.includes("whitespace policy"))).toBe(true);
  source.occurrences[0]!.styles["white-space-collapse"] = "preserve-breaks";
  expect(validateTextProjection(source, emitted).accounted).toBe(true);
});

test("verified converter flags cannot override wrong raw/root/path/order or unsupported origin", () => {
  const source = ledger(), claimed = capture(source); claimed.occurrences[0]!.raw = "same length";
  expect(compareTextSourceCapture(source, claimed).failures.length).toBeGreaterThan(0);
  claimed.occurrences = capture(source).occurrences.toReversed();
  expect(compareTextSourceCapture(source, claimed).failures.length).toBeGreaterThan(0);
  const origin = capture(source); origin.occurrences[0]!.origin = "generated";
  expect(validateTextProjection(source, copies(source), origin).accounted).toBe(false);
  const wrongRoot = capture(source); wrongRoot.root.tag = "section";
  expect(compareTextSourceCapture(source, wrongRoot).failures.length).toBeGreaterThan(0);
});
