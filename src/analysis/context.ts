/** Shared inference data contracts. No runtime dependencies. */
import { type LayoutNode, type Rect } from "../model/layout.ts";
import { type LabelIndex } from "./controls.ts";
import { type SemNode, type Axis, type CrossAlign, type TextRun } from "../model/semantic.ts";
import { type BundledFamilies } from "../model/fonts.ts";

/** A text run: one text node and the element whose computed style it inherits. */
export interface SourceTextRun {
  node: LayoutNode;
  styleOf: LayoutNode;
}

export interface AnalyzedChild {
  node: LayoutNode;
  sem: SemNode;
}

export interface InferOptions {
  /** Fonts packaged for this conversion; omitted families use system fallback. */
  bundledFamilies?: BundledFamilies;
}

export interface InferenceContext {
  bundledFamilies: BundledFamilies;
  /** Capture root; lets SVG `<use>` resolve sprites elsewhere in the document. */
  root: LayoutNode;
  /** `position: fixed` descendants collected for hoisting onto the screen root. */
  fixed: LayoutNode[];
  parent?: LayoutNode;
  parentAxis?: Axis;
  parentDisplay?: string;
  parentAlign?: CrossAlign;
  /** Nearest ancestor with `background-clip: text`: its gradient is the glyph fill of block descendants' text. */
  textClip?: LayoutNode;
  /** Capture viewport in root coordinates (see LayoutDoc.viewport). */
  viewport?: Rect;
  /** `<label>` ↔ control pairs of the capture; absent in hand-built contexts. */
  labels?: LabelIndex;
}

/** A run under construction: the emitted run plus, per character, its index in the raw text node. */
export interface MeasuredTextRun {
  run: TextRun;
  node: LayoutNode;
  /** The element whose computed style the run inherits — `host` itself for its own text nodes. */
  styleOf: LayoutNode;
  src: number[];
}
