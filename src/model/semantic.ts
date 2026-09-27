/**
 * Semantic IR — what the design *means*, target-agnostic. One tree per screen.
 * Every node keeps its measured frame (for verification and absolute fallback)
 * plus a `confidence` telling emitters how faithful the mapping is.
 * No SwiftUI / Compose vocabulary here.
 */
import type { Color, Paint, Shadow, Transform2D } from "../css/index.ts";
import type { Rect } from "./layout.ts";
import type { AllocationTrack } from "./allocation.ts";
import type { GridPlacement } from "./grid.ts";
import type { TableLayout } from "./table.ts";
export type { AllocationTrack } from "./allocation.ts";
export type { GridPlacement } from "./grid.ts";
export type { TableLayout } from "./table.ts";

export type Confidence = "mapped" | "approximated" | "unmapped";

export type Size = { kind: "fixed"; px: number } | { kind: "fill" } | { kind: "hug" }
  | { kind: "fraction"; value: number; capturedPx: number };

/** Captured content extent and child border boxes for layouts whose native rules differ. */
export interface MeasuredLayout {
  width: number;
  height: number;
  frames: Rect[];
}

export type Axis = "v" | "h";

/** Cross-axis alignment of children inside a stack. */
export type CrossAlign = "start" | "center" | "end" | "stretch" | "baseline";
/** Main-axis distribution. */
export type Distribution = "start" | "center" | "end" | "between" | "around" | "evenly";

export type BorderStyle = "solid" | "dashed" | "dotted" | "double";

/** One border edge as the browser resolved it. */
export interface Edge {
  width: number;
  color: Color;
  style: BorderStyle;
}

/** CSS `filter` list entry, in source order. */
export type Filter =
  | { kind: "blur"; radius: number }
  | { kind: "drop-shadow"; shadow: Shadow }
  | { kind: "grayscale" | "brightness" | "contrast" | "saturate" | "invert" | "sepia" | "opacity"; amount: number }
  | { kind: "hue-rotate"; degrees: number };

/** `clip-path` basic shapes, px relative to the node's top-left. */
export type ClipShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "inset"; top: number; right: number; bottom: number; left: number; radius?: number }
  | { kind: "polygon"; points: Array<[number, number]> };

export interface Style {
  /** Background layers, bottom-most first. */
  fills: Paint[];
  /** Browser nearest-neighbor image scaling; inherited and applied to raster paint. */
  imageRendering?: "pixelated" | "crisp-edges";
  /** Corner radii: top-left, top-right, bottom-right, bottom-left (px). */
  radius?: [number, number, number, number];
  /** All four corners meet at half-width/half-height: CSS 50% radii form an ellipse. */
  ellipse?: true;
  /** Uniform border (all four edges equal). */
  border?: { width: number; color: Color; dashed?: boolean };
  /** Per-edge borders when the edges differ; `border` is unset then. Missing edge = none. */
  borderSides?: { top?: Edge; right?: Edge; bottom?: Edge; left?: Edge };
  /**
   * `outline-*`: a stroke ring `offset` px outside the border edge (negative = inside),
   * following the node's radius. `outline-style: auto` arrives as `solid`.
   */
  outline?: { width: number; color: Color; style: BorderStyle; offset: number };
  shadows: Shadow[];
  opacity?: number;
  /** Children clipped to the rounded box. */
  clip?: boolean;
  /** Gaussian blur applied to the node itself (px). */
  blur?: number;
  /** Full CSS filter list; `blur` stays as the fast path when it is the only function. */
  filters?: Filter[];
  /** Backdrop blur — a material approximation on native targets. */
  backdropBlur?: number;
  transform?: Transform2D & { origin?: [number, number] };
  blend?: string;
  /** `clip-path` basic shape. */
  clipPath?: ClipShape;
  /** `mask-image` gradient (luminance/alpha mask). */
  mask?: Paint;
  /** `visibility: hidden` — occupies space, paints nothing. */
  hidden?: boolean;
  /** Names of CSS custom properties the declared style referenced (token hints). */
  tokens?: string[];
}

export interface FontSpec {
  /** `system` families map to platform fonts by design; `custom` is a bundled family name. */
  family: { kind: "system"; design: "default" | "rounded" | "monospaced" | "serif" } | { kind: "custom"; name: string };
  size: number;
  weight: number;
  /** Optical size axis value when the family has one (Chrome uses font-size). */
  opsz?: number;
  /** CSS-selected static source face; fidelity only until app matching is independently proved. */
  staticFace?: { postScriptName: string; matchedWeight: number; assetHash: string };
  /** CSS line-height in px when explicitly set; undefined = normal. */
  lineHeight?: number;
}

export type TextTransform = "uppercase" | "lowercase" | "capitalize";
export type DecorationLine = "underline" | "line-through" | "overline";

export interface TextDecoration {
  lines: DecorationLine[];
  color?: Color;
  style?: "solid" | "double" | "dotted" | "dashed" | "wavy";
}

export interface TextRun {
  text: string;
  /** Optional ordered raw UTF16 source projection; independently validated when observing text. */
  source?: import("./text-source.ts").TextRunSource;
  /** Navigable absolute URL for an inline link; relative targets require an app route. */
  href?: string;
  font: FontSpec;
  color: Color;
  kerning?: number;
  /** CSS `text-transform`; emitters apply it (`.textCase`) so bound text keeps it at runtime. */
  transform?: TextTransform;
  italic?: boolean;
  decoration?: TextDecoration;
  /** `text-shadow`. */
  shadow?: Shadow;
  /** Gradient/image glyph fill (`background-clip: text`); replaces `color` when present. */
  paint?: Paint;
  tabularNums?: boolean;
  /**
   * Baseline shift in px, positive = up (`vertical-align: super`/`sub`, `<sup>`/`<sub>`),
   * measured against the baseline of the surrounding text on the same line. The smaller
   * font a shifted run usually carries is already in `font.size`.
   */
  baselineOffset?: number;
  /**
   * Character offsets into `text` where the browser started a new line box. Fidelity emit
   * turns them into hard breaks so the measured layout is reproduced instead of re-wrapped;
   * app emit ignores them and lets the platform break lines. Noted on the node whenever a
   * division is forced on a multi-line paragraph — whether the platform would have broken
   * identically cannot be known offline.
   */
  breaks?: number[];
  /** True when the run came from a template interpolation (`{{ … }}`). */
  bound?: boolean;
  /**
   * A run that paints no glyphs and only advances the line by this many points: the horizontal
   * padding/border of an inline element (`kbd`, `mark`, `code`), which a native text run cannot
   * carry as a box.
   */
  gap?: number;
}

/**
 * Paint server resolved from `<linearGradient>`/`<radialGradient>`. Coordinates are viewBox
 * user units — `objectBoundingBox` gradients are resolved against the painted path's
 * bounding box when the IR is built. `radius` is per axis (an object-bounding-box radial
 * gradient on a non-square box is an ellipse).
 */
export type SvgGradient = { stops: Array<{ color: Color; pos: number }> } & (
  | { kind: "linear"; start: [number, number]; end: [number, number] }
  | { kind: "radial"; center: [number, number]; radius: [number, number] }
);

export interface SvgPath {
  /** Path data in viewBox user units; ancestor and own `transform`s are baked in. */
  d: string;
  fill?: Color;
  /** Gradient fill (`fill="url(#id)"`); set instead of `fill`. */
  gradient?: SvgGradient;
  /** `fill-opacity` when below 1. */
  fillOpacity?: number;
  /** `fill-rule: evenodd`. */
  eoFill?: true;
  stroke?: Color;
  /** Gradient stroke (`stroke="url(#id)"`); set instead of `stroke`. */
  strokeGradient?: SvgGradient;
  strokeWidth?: number;
  /** `stroke-opacity` when below 1. */
  strokeOpacity?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  /** `stroke-miterlimit` when declared (the SVG default 4 differs from native defaults). */
  miterLimit?: number;
  /** `stroke-dasharray` lengths and `stroke-dashoffset`, viewBox units; unset for the ring idiom. */
  dash?: number[];
  dashPhase?: number;
  /** Element `opacity` times ancestor group opacities, when below 1. */
  opacity?: number;
  /**
   * Progress-ring idiom: a viewBox-centred circle whose single dash length covers its
   * circumference. `to` = visible fraction 0..1, `startAngle` in degrees clockwise from
   * 3 o'clock (the baked rotation).
   */
  ring?: { r: number; to: number; startAngle: number };
  /** `clip-path="url(#id)"`: the clipPath's shapes as one path in the same space as `d`. */
  clip?: { d: string; eoFill?: true };
  /** `mask="url(#id)"`: the mask's painted shapes; their luminance becomes this layer's alpha. */
  mask?: SvgPath[];
}

/** One `<text>`/`<tspan>` text run, placed where the browser laid it out. */
export interface SvgText {
  text: string;
  /** Anchor point from the `x`/`y` attributes (viewBox units) and `text-anchor`. */
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  font: FontSpec;
  fill: Color;
  /** Measured glyph box relative to the svg frame (px). */
  box: Rect;
}

export interface Overlay {
  node: SemNode;
  /** Painted behind (`background`) or in front of (`overlay`) the in-flow content. */
  layer: "background" | "overlay";
  /** Offset of the node's top-left from the host's top-left (px). */
  offset: [number, number];
  /** True when the node covers exactly the host box (inset: 0). */
  covers: boolean;
}

/** CSS min/max constraints expressed on the painted border box, in captured CSS pixels. */
export interface SizeConstraints {
  minWidth?: number;
  intrinsicMinWidth?: import("./intrinsic-width.ts").IntrinsicMinWidth;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface SemBase extends SizeConstraints {
  /** Template path id; stable across regenerations. */
  id: string;
  frame: Rect;
  /** Relative positioning moves paint only; frame remains the captured painted border. */
  relativeOffset?: [number, number];
  /** Supported fieldset decoration resolves the emitted legend's live native border anchor. */
  fieldsetPaint?: { key: string; legendId: string };
  /** Direct rendered legend anchor; displacement is removed for the fieldset's static cutout. */
  fieldsetLegend?: { key: string; relativeOffset: [number, number] };
  width: Size;
  height: Size;
  /**
   * Cross-axis placement inside the parent's content box when the box does not span it
   * (CSS auto or asymmetric margins). Default: leading.
   */
  selfAlign?: "center" | "end";
  /**
   * Set on a node whose computed `direction` differs from its parent's; emitters override the
   * layout direction there. Inherited descendants leave it unset, so it is emitted once per
   * change — an LTR island inside an RTL block needs its own `"ltr"`.
   */
  layoutDirection?: "rtl" | "ltr";
  /** top, right, bottom, left — includes border width so content lands where the browser put it. */
  padding: [number, number, number, number];
  style: Style;
  confidence: Confidence;
  notes: string[];
  overlays: Overlay[];
}

export interface StackNode extends SemBase {
  kind: "stack";
  /** Guarded app-only ordinary inline continuation; captured sizes remain fallback/fidelity. */
  inlineContentFlow?: import("./inline-content-flow.ts").InlineContentFlow;
  contentAutoHeight?: import("./inline-content-flow.ts").ContentAutoHeight;
  axis: Axis;
  /** Uniform spacing, or one gap per adjacent pair when they differ. */
  spacing: number | number[];
  align: CrossAlign;
  distribution: Distribution;
  /** Leading offset before the first child that padding does not explain. */
  leadInset: number;
  scroll?: Axis;
  /** Fixed-size row items, or guarded equal-width tracks, that reflow at the offered width. */
  wrap?: { columnGap: number; rowGap: number; columns?: number };
  /** Captured positions for wrapping combinations without a native layout mapping. */
  measured?: MeasuredLayout;
  /** Proven CSS flex bases and growth/shrink factors for a responsive native row. */
  allocation?: { tracks: AllocationTrack[] };
  /** Plain auto-basis items measured natively before line collection and shrink allocation. */
  intrinsicFlex?: { wrapping: boolean; columnGap: number; rowGap: number; shrink: number[]; automaticMinimum: boolean[] };
  /** Guarded single ordinary inline line; native guide failures are reported by the runtime. */
  inlineBaseline?: {
    strutAscent: number; strutDescent: number;
    /** Captured physical CSS padding + painted border; excludes inferred inline line-tail slack. */
    sourceInsets: [number, number, number, number];
    items: Array<{ kind: "widget" | "text"; baseline: number; height: number; top: number; bottom: number }>;
  };
  /** Proven column definitions and cell spans, independent of DOM wrapper boxes. */
  table?: TableLayout;
  children: SemNode[];
}

export interface GridNode extends SemBase {
  kind: "grid";
  columns: number;
  hSpacing: number;
  vSpacing: number;
  measured?: MeasuredLayout;
  /** Authored fixed/fractional columns, retained before Chrome resolves them to pixels. */
  tracks?: AllocationTrack[];
  /** Numeric lines and column spans, one per child in source order. */
  placements?: GridPlacement[];
  /** Declared pixel rows or auto rows (null), including empty rows. */
  rowSizes?: Array<number | null>;
  children: SemNode[];
}

/** Browser baseline geometry relative to the text content origin, excluding padding. */
export interface TextLineBox {
  firstBaseline: number;
  baselineToBottom: number;
  baselineStep: number;
  /** Captured baselines validate fidelity only; app line count comes from native layout. */
  baselines: number[];
}

export interface TextNode extends SemBase {
  kind: "text";
  /** Source element, retained so emitters can scope text-layout strategies safely. */
  sourceTag?: string;
  runs: TextRun[];
  /** Omitted source runs stay explicit; suppression is not inferred from a missing glyph box. */
  sourceAccounting?: import("./text-source.ts").TextRunSource;
  align: "leading" | "center" | "trailing";
  lineLimit?: number;
  truncate?: boolean;
  /**
   * The browser did not soft-wrap this text (`text-wrap-mode: nowrap`, `white-space: pre`), so
   * `lineLimit` only caps its hard breaks and a long line overflows its box rather than
   * re-flowing. Unset means normal wrapping.
   */
  noWrap?: true;
  /** Authored character-breaking CSS must retain native Text rather than whole-word flow. */
  wrapAnywhere?: true;
  /** Measured height of the laid-out text; lets verifiers spot line-break drift. */
  lines: number;
  lineBox?: TextLineBox;
}

export interface SvgNode extends SemBase {
  kind: "svg";
  /** Proved UA first-summary triangle; only a surrounding disclosure supplies live state. */
  disclosureSymbol?: { capturedExpanded: boolean; rect: Rect };
  viewBox: [number, number, number, number];
  /** Standalone SVG resource viewport; may differ from viewBox (for an <img> data URL). */
  intrinsicSize?: [number, number];
  /** Intrinsic SVG root dimension is zero or negative; background tiling cannot use it. */
  invalidIntrinsic?: string;
  paths: SvgPath[];
  /** Text runs drawn over the shapes. */
  texts?: SvgText[];
  /** `<title>` → accessibility label. */
  label?: string;
  /** `preserveAspectRatio="none"`: paths stretch to the frame instead of uniform scale + centring. */
  stretch?: true;
}

export interface ImageNode extends SemBase {
  kind: "image";
  src: string;
  /** CSS object-fit: cover/contain/fill/none. `scale-down` is captured as fit with a diagnostic. */
  contentMode: "fill" | "fit" | "stretch" | "none";
  /** CSS object-position percentages on the free space after cover/contain sizing (0 = near edge, 1 = far edge). */
  objectPosition?: [number, number];
  /** Encoded pixel size of a supported inline image; needed to position scaled artwork inside its box. */
  intrinsicSize?: [number, number];
  /** `<img alt>`: the accessibility label, and the text the browser paints when the source is broken. */
  alt?: string;
  /** Computed font of the element; used when the alt text stands in for a source that cannot render. */
  font?: FontSpec;
  /** Font provenance applies only if the emitter actually paints this image's alt fallback. */
  fallbackFontDiagnostic?: string;
  /** Computed `color` of the element, for that same alt text. */
  color?: Color;
}

/** Empty decorative box (blobs, dividers, progress tracks). */
export interface BoxNode extends SemBase {
  kind: "box";
}

// ---------- controls ----------

/**
 * The interactive thing an element *is*, independent of how it is painted. Chosen from the tag
 * and its attributes (`src/analysis/controls.ts`), never from geometry: `input[type=range]` is a
 * slider whether the design styles it as a track or a dial.
 */
export type ControlKind =
  | "button"
  | "link"
  | "textField"
  | "secureField"
  | "textEditor"
  | "toggle"
  | "radio"
  | "slider"
  | "stepper"
  | "picker"
  | "datePicker"
  | "colorPicker"
  | "progress"
  | "gauge"
  | "disclosure";

/** Captured plain row typography and paint, reusable across native option selection states. */
export interface SelectRowAppearance {
  height: number;
  padding: [number, number, number, number];
  font: FontSpec;
  color?: Color;
  background?: Color;
}

/**
 * A form control, link or media indicator. Its box (fill, border, radius, padding, frame) is the
 * measured one every other node carries — the emitter paints it exactly as it would a stack — and
 * `control` says which native view goes inside it.
 */
export interface ControlNode extends SemBase {
  kind: "control";
  control: ControlKind;
  /** The control's own title: `<summary>` for a disclosure, `<label>` text where one wraps it. */
  label?: SemNode;
  /** Laid-out children in document order: a button's icon and caption, a link card's rows. */
  content: SemNode[];
  /** Initial text/number the design shows (`@value`, `<textarea>` text, the selected `<option>`). */
  value?: string;
  /** CSS casing for a value-painted input button caption. */
  captionTransform?: TextTransform;
  /** `@placeholder`: the prompt drawn while the field is empty. */
  placeholder?: string;
  /** `@checked`: initial on state of a toggle/radio. */
  checked?: boolean;
  /** Supported native checkbox/radio CSS color-scheme; both follow the captured screen preference. */
  markColorScheme?: "light" | "dark" | "light dark";
  /** Captured DOM tree/form owner plus nonempty name; absent radios select independently. */
  radioGroup?: string;
  /** `@disabled`: the control is inert (Chrome also dims it, so the measured style already shows it). */
  disabled?: boolean;
  /** Read-only text controls retain their value without an editable native binding. */
  readOnly?: boolean;
  /** HTML date-family granularity; month/week require a custom selector and remain static. */
  dateKind?: "date" | "time" | "datetime-local" | "month" | "week";
  /** Gregorian/local wall-clock components, never a timestamp derived in the build timezone. */
  dateComponents?: { year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; nanosecond?: number };
  /** Numeric domain of a slider/progress/gauge, resolved from `@min`/`@max`/`@step`. */
  range?: { min: number; max: number; step?: number };
  /**
   * `<meter>` only: where the value falls against `low`/`high`/`optimum` (HTML's gauge algorithm).
   * Browsers colour the bar by this state — green, amber, red — and so does the emitter.
   */
  level?: "optimum" | "suboptimal" | "poor";
  /** Picker choices in document order (`<option>` labels). */
  options?: string[];
  /** HTML options keyed by flattened ordinal, independently of duplicate values or labels. */
  choices?: Array<{ id: number; value: string; label: string; disabled: boolean; hidden?: boolean; invisible?: boolean; row?: SelectRowAppearance; group?: { id: number; label: string; invisible?: boolean; row?: SelectRowAppearance } }>;
  /** Captured selected option ordinal; -1 retains an intentionally empty selection. */
  selectedChoice?: number;
  /** Native row selection for HTML multiple selects and size>1 single listboxes. */
  selectList?: "single" | "multiple";
  /** All live selected option ordinals for a multiple select, including disabled/hidden options. */
  selectedChoices?: number[];
  /** Captured visible rows, relative to the select border box, including its scroll position. */
  selectRows?: Array<{ kind: "option" | "group"; choice?: number; label: string; frame: Rect; padding: [number, number, number, number]; font: FontSpec; color?: Color; background?: Color }>;
  /** Empty selects or manual legacy callers can request a static fallback. */
  selectStatic?: boolean;
  /** Serialized external destination, or authored href when app-specific navigation is needed. */
  href?: string;
  /**
   * The callback the generated view should run: an `@onclick` handler's source, or — for an
   * `<a href>` the app cannot resolve (an in-page fragment, a relative path) — the target the
   * design named, so the placeholder the developer fills in says which link it was.
   */
  action?: string;
  /** `<details open>`: initial disclosure state. */
  expanded?: boolean;
  /** Captured summary/content separation; unavailable closed descendants remain unavailable. */
  disclosureLayout?: { gap: number; labelInset: number; contentInset: number; contentAvailable: boolean };
  /**
   * `<input type=file>`: the element is a button that presents the system file picker, so the
   * presence of this field — not a control kind of its own — is what attaches `.fileImporter`.
   * `accept` holds the attribute's tokens as authored (`.png`, `image/png`, `image/*`); they
   * name types in the system's database, so they are resolved at runtime, not here.
   */
  files?: { accept: string[]; multiple?: boolean };
  /** Font of the control's own text (the field's value, the picker's selection) — the element's computed font. */
  font?: FontSpec;
  /** Colour of that text (the element's computed `color`). */
  color?: Color;
}

export type SemNode = StackNode | GridNode | TextNode | SvgNode | ImageNode | BoxNode | ControlNode;

export interface Screen {
  version: 1;
  name: string;
  source: string;
  /** Converter-side raw occurrence claims; only opt-in text observation serializes them. */
  textSourceCapture?: import("./text-source.ts").TextSourceCapture;
  theme: "light" | "dark";
  size: { w: number; h: number };
  /** Backdrop behind the root, from the design. */
  canvas: Color;
  root: SemNode;
}

export function walk(n: SemNode, fn: (n: SemNode, depth: number) => void, depth = 0): void {
  fn(n, depth);
  for (const o of n.overlays) walk(o.node, fn, depth + 1);
  if (n.kind === "stack" || n.kind === "grid") for (const c of n.children) walk(c, fn, depth + 1);
  if (n.kind === "control") {
    if (n.label) walk(n.label, fn, depth + 1);
    for (const c of n.content) walk(c, fn, depth + 1);
  }
}
