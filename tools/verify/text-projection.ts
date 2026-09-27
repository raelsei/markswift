import { isDeepStrictEqual } from "node:util";
import type { TextRunSource, TextSourceCapture, SourceInterval } from "../../src/model/text-source.ts";
import type { ChromeTextLedger, TextProjectionReport } from "./text-ledger-model.ts";
import { textLedgerHash, utf16Hash } from "./text-ledger-chrome.ts";

/** Recompute converter joins against independently observed paths, raw values and ancestry. */
export function compareTextSourceCapture(ledger: ChromeTextLedger, capture: TextSourceCapture): { failures: string[]; unavailable: string[] } {
  const failures: string[] = [], unavailable = [...ledger.unavailable, ...capture.unavailable];
  const { selector: _selector, frame: _frame, ...root } = ledger.root;
  if (capture.version !== 1 || capture.trust !== "converter-capture-claim" || !isDeepStrictEqual(root, capture.root)) failures.push("capture root or external styling differs from live DOM");
  const dom = capture.occurrences.filter(source => source.origin === "dom");
  if (dom.length !== ledger.occurrences.length) failures.push("source occurrence membership differs from live DOM");
  const keys = new Set<string>();
  capture.occurrences.forEach(source => {
    if (keys.has(source.key)) failures.push(`duplicate capture occurrence ${source.key}`);
    keys.add(source.key);
    if (source.origin !== "dom" || source.join !== "verified") unavailable.push(`${source.key}: converter join is unavailable`);
  });
  ledger.occurrences.forEach((expected, index) => {
    const actual = dom[index];
    if (!actual || actual.key !== expected.key || actual.kind !== expected.kind || actual.raw !== expected.raw
      || !isDeepStrictEqual(actual.ancestors, expected.ancestors)) failures.push(`${expected.key}: source path/type/raw/ancestry join differs`);
  });
  return { failures, unavailable: [...new Set(unavailable)] };
}

export interface TextEmissionProjection { key: string; literal: string; literalUtf16Sha256: string; source: TextRunSource }

/** Exact accounting only. Native run scopes and glyph paint require separate actual proofs. */
export function validateTextProjection(ledger: ChromeTextLedger, emissions: readonly TextEmissionProjection[], capture?: TextSourceCapture): TextProjectionReport {
  const failures: string[] = [], unavailable = [...ledger.unavailable];
  const occurrences = new Map(ledger.occurrences.map((source, index) => [source.key, { source, index, covered: new Uint8Array(source.raw.length), empty: 0 }]));
  if (ledger.version !== 1 || ledger.contract !== "live-dom-text-ledger-v1" || ledger.observer !== "independent-live-dom" || ledger.hashEncoding !== "utf16le") failures.push("invalid independent ledger contract");
  if (occurrences.size !== ledger.occurrences.length) failures.push("duplicate live source occurrence");
  for (const { source } of occurrences.values()) {
    if (source.rawUtf16Sha256 !== utf16Hash(source.raw)) failures.push(`${source.key}: raw UTF16 hash differs`);
    unavailable.push(...source.unavailable.map(reason => `${source.key}: ${reason}`));
  }
  if (capture) { const joined = compareTextSourceCapture(ledger, capture); failures.push(...joined.failures); unavailable.push(...joined.unavailable); }
  let lastOrder = -1, classifiedUtf16Length = 0;
  const claim = (interval: SourceInterval, ordered: boolean): string => {
    const entry = occurrences.get(interval.occurrence);
    if (!entry) { failures.push(`unknown source occurrence ${interval.occurrence}`); return ""; }
    const { source } = entry, { start, end } = interval;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.raw.length
      || start === end && source.raw.length !== 0) { failures.push(`${source.key}: invalid UTF16 interval ${start}:${end}`); return ""; }
    const order = entry.index + start / (source.raw.length + 1);
    if (ordered && order < lastOrder) failures.push(`${source.key}: reordered source interval`);
    if (ordered) lastOrder = order;
    if (source.raw.length === 0) { if (++entry.empty !== 1) failures.push(`${source.key}: duplicate empty/break occurrence`); }
    for (let index = start; index < end; index++) {
      if (entry.covered[index]) failures.push(`${source.key}: overlapping source UTF16 interval at ${index}`);
      else { entry.covered[index] = 1; classifiedUtf16Length++; }
    }
    return source.raw.slice(start, end);
  };
  const emitted = new Set<string>();
  for (const emission of emissions) {
    if (!emission.key || emitted.has(emission.key)) failures.push(`duplicate/empty emission key ${emission.key}`);
    emitted.add(emission.key);
    if (emission.literalUtf16Sha256 !== utf16Hash(emission.literal)) failures.push(`${emission.key}: emitted UTF16 hash differs`);
    if (emission.source.version !== 1) failures.push(`${emission.key}: invalid projection version`);
    unavailable.push(...emission.source.unavailable.map(reason => `${emission.key}: ${reason}`));
    let cursor = 0;
    for (const unit of emission.source.units) {
      const [start, end] = unit.output;
      if (start !== cursor || !Number.isInteger(end) || end < start || end > emission.literal.length) failures.push(`${emission.key}: missing/overlapping output UTF16 interval`);
      cursor = end;
      const original = unit.sources.map(interval => claim(interval, true)).join(""), output = emission.literal.slice(start, end);
      if ((unit.operation === "copy" || unit.operation === "source-break")
        && unit.sources.some(interval => occurrences.get(interval.occurrence)?.source.rendering === "suppressed")) failures.push(`${emission.key}: suppressed occurrence emitted instead of independently excluded`);
      if (unit.operation === "copy") {
        if (!unit.sources.length || original !== output) failures.push(`${emission.key}: copy literal differs from original UTF16`);
        for (const interval of unit.sources) {
          const source = occurrences.get(interval.occurrence)?.source;
          if (source && source.kind !== "text") failures.push(`${source.key}: break occurrence cannot be copied as empty text`);
          if (source && /[\t\n\r\f ]/.test(source.raw.slice(interval.start, interval.end)) && source.styles["white-space-collapse"] !== "preserve"
            && !/^(pre|pre-wrap|break-spaces)$/.test(source.styles["white-space"] ?? "")) unavailable.push(`${source.key}: collapsed whitespace projection is unproved`);
        }
      } else if (unit.operation === "source-break") {
        const boundary = unit.boundary, owner = boundary?.owner ? occurrences.get(boundary.owner)?.source : undefined;
        if (!owner || boundary?.kind === "fidelity-inserted" || owner.kind !== "text" && boundary?.kind !== owner.kind
          || owner.kind === "br" && output !== "\n" || owner.kind === "wbr" && output !== ""
          || owner.kind === "text" && (boundary?.kind !== "source-newline" || !/^(\n|\r\n)$/.test(original) || output !== "\n")) failures.push(`${emission.key}: source break owner/literal differs`);
        if (unit.sources.length > 1 || unit.sources.some(interval => interval.occurrence !== boundary?.owner)
          || owner?.kind === "text" && (unit.sources.length !== 1 || !isDeepStrictEqual(unit.sources[0], boundary?.source))) failures.push(`${emission.key}: source break cannot consume another occurrence or an unbound newline interval`);
        if (owner?.rendering === "suppressed") failures.push(`${emission.key}: suppressed break occurrence emitted`);
        if (owner?.kind === "text" && !/^(preserve|preserve-breaks)$/.test(owner.styles["white-space-collapse"] ?? "")
          && !/^(pre|pre-wrap|pre-line|break-spaces)$/.test(owner.styles["white-space"] ?? "")) unavailable.push(`${owner.key}: source newline is not independently retained by CSS whitespace policy`);
        if (owner && !unit.sources.some(interval => interval.occurrence === owner.key)) claim({ occurrence: owner.key, start: 0, end: 0 }, true);
      } else if (unit.operation === "synthetic") {
        if (unit.sources.length || !/^[ \t\r\n]*$/.test(output) || !unit.reason) failures.push(`${emission.key}: synthetic token is not declared layout-only whitespace`);
        if (unit.boundary && (unit.boundary.kind !== "fidelity-inserted" || unit.boundary.owner !== null)) failures.push(`${emission.key}: inserted boundary falsely owns source`);
      } else unavailable.push(`${emission.key}: ${unit.operation} projection is independently unproved`);
    }
    if (cursor !== emission.literal.length) failures.push(`${emission.key}: unclassified emitted UTF16 suffix`);
    for (const excluded of emission.source.excluded) {
      for (const interval of excluded.sources) {
        claim(interval, false);
        const source = occurrences.get(interval.occurrence)?.source;
        if (excluded.operation === "suppressed") {
          if (source?.rendering !== "suppressed" || !source.suppression.length) failures.push(`${interval.occurrence}: suppression is not independently observed`);
        } else unavailable.push(`${interval.occurrence}: ${excluded.operation} exclusion is independently unproved`);
      }
    }
  }
  for (const { source, covered, empty } of occurrences.values()) {
    if (source.raw.length === 0 ? empty !== 1 : covered.some(value => value !== 1)) failures.push(`${source.key}: missing source occurrence/UTF16 coverage`);
  }
  return { version: 1, contract: "source-text-projection-v1", ledgerSha256: textLedgerHash(ledger),
    accounted: failures.length === 0 && unavailable.length === 0, failures, unavailable: [...new Set(unavailable)],
    sourceUtf16Length: ledger.occurrences.reduce((total, source) => total + source.raw.length, 0), classifiedUtf16Length,
    nativeCoverage: "not-observed", paintAcceptance: "not-evaluated" };
}
