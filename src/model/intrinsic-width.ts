import type { FontSpec } from "./semantic.ts";

/** App-only native content contribution; no captured rectangles or glyph advances. */
export type IntrinsicWidth =
  | { kind: "words"; text: string; font: FontSpec }
  | { kind: "fixed"; value: number }
  | { kind: "maximum"; children: IntrinsicWidth[] }
  | { kind: "inset"; value: number; content: IntrinsicWidth };

/** Numeric min/max remain the legacy/fidelity fallback, including for declined requests. */
export interface IntrinsicMinWidth {
  kind: "min-content";
  /** Resolved border-box maximum before the captured minimum's precedence adjustment. */
  authoredMaxWidth?: number;
  program?: IntrinsicWidth;
}
