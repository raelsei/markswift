/** Browser observations, separate from converter source claims and native text coverage. */
export interface TextLedgerRect { x: number; y: number; w: number; h: number }
export interface TextLedgerAncestor { key: string; tag: string; display: string }
export interface TextLedgerNode {
  key: string; type: number; name: string; raw: string;
  ancestors: TextLedgerAncestor[];
}
export interface TextLedgerOccurrence {
  key: string; kind: "text" | "br" | "wbr"; raw: string; rawUtf16Sha256: string;
  ancestors: TextLedgerAncestor[]; styles: Record<string, string>;
  rendering: "visible" | "suppressed" | "unavailable";
  suppression: string[]; unavailable: string[];
  fragments: TextLedgerRect[];
  /** Each actual DOMRange covers a Unicode code point in the original UTF16 string. */
  ranges: Array<{ start: number; end: number; fragments: TextLedgerRect[] }>;
}
export interface ChromeTextLedger {
  version: 1; contract: "live-dom-text-ledger-v1"; observer: "independent-live-dom";
  hashEncoding: "utf16le"; browserVersion: string;
  document: { url: string; mode: string; htmlSha256: string; viewportWidth: number; viewportHeight: number;
    deviceScaleFactor: number; theme: "light" | "dark" };
  root: { key: "dom:/"; type: 1; tag: string; selector: string; frame: TextLedgerRect;
    externalAncestors: Array<{ tag: string; styles: Record<string, string> }> };
  nodes: TextLedgerNode[]; occurrences: TextLedgerOccurrence[]; unavailable: string[];
}

/** A source projection report never asserts native glyph/layout/paint completeness. */
export interface TextProjectionReport {
  version: 1; contract: "source-text-projection-v1"; ledgerSha256: string;
  accounted: boolean; failures: string[]; unavailable: string[];
  sourceUtf16Length: number; classifiedUtf16Length: number;
  nativeCoverage: "not-observed"; paintAcceptance: "not-evaluated";
}
