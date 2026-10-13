/**
 * Semantic IR — what the design *means*, target-agnostic. One tree per screen.
 * Every node keeps its measured frame (for verification and absolute fallback)
 * plus a `confidence` telling emitters how faithful the mapping is.
 * No SwiftUI / Compose vocabulary here.
 */
import type { BlendMode, Color, Paint, Shadow, Transform2D } from "./values.ts";
import type { Rect, Theme } from "./layout.ts";

export type Confidence = "mapped" | "approximated" | "unmapped";

export type DiagnosticLevel = "approximated" | "unmapped";

/**
 * One captured feature the generated view does not reproduce faithfully. `feature` is the id of a
 * row in tests/conformance/inventory (`font-family`, `display: grid`, `svg:textPath`, `img`), so
 * reports group by the product decision for that feature; `message` says what was lost, without a
 * level prefix.
 */
export interface Diagnostic {
  level: DiagnosticLevel;
  feature: string;
  message: string;
}

/** Appends the diagnostic unless an identical one is already listed. */
export function addDiagnostic(list: Diagnostic[], level: DiagnosticLevel, feature: string, message: string): void {
  if (!list.some((d) => d.level === level && d.feature === feature && d.message === message))
    list.push({ level, feature, message });
}

/** The only confidence rule: the worst level present, `mapped` when there is none. */
export function confidenceOf(list: readonly Diagnostic[]): Confidence {
  return list.some((d) => d.level === "unmapped") ? "unmapped" : list.length ? "approximated" : "mapped";
}

/**
 * One per-conversion message, not tied to a node. `capture`: page errors, unreadable resources
 * and viewport-dependent CSS the view does not follow; `fonts`: font packaging; `adaptive`:
 * light/dark pairing; `build`: `markswift build` (plan 033); `palette`: palette mapping (plan 034).
 * `level` and `feature` are set together when the message is a design loss, with the same
 * meaning as on `Diagnostic` (`feature` is an inventory row id). `component` names the
 * component a package build was converting when the message arose.
 */
export interface ConversionWarning {
  source: "capture" | "fonts" | "adaptive" | "build" | "palette";
  level?: DiagnosticLevel;
  feature?: string;
  component?: string;
  message: string;
}

export type Size =
  /**
   * `hug`: CSS sizes the box to its content; the captured px only keeps a filling descendant from making it greedy
   * (fidelity pins it, app mode fits it to its native content).
   */
  | { kind: "fixed"; px: number; hug?: true }
  | { kind: "fill" }
  | { kind: "hug" }
  /** CSS percentage width of the containing block; `px` is the captured width (fidelity keeps it). */
  | { kind: "fraction"; fraction: number; px: number };

/** Captured content extent and child border boxes for layouts whose native rules differ. */
export interface MeasuredLayout {
  width: number;
  height: number;
  frames: Rect[];
}

/** One authored grid column track the runtime can size: px, fr, or content (`auto`). */
export type GridTrack = { kind: "px"; px: number } | { kind: "fr"; fr: number } | { kind: "auto" };
/**
 * An authored `grid-template-columns` that `MarkswiftTracks` reproduces. Either explicit `tracks`, or
 * `autoRepeat` (`repeat(auto-fill|auto-fit, minmax(<min>px, 1fr))`, equal columns, count from the width).
 */
export interface GridTemplate {
  tracks: GridTrack[];
  autoRepeat?: { mode: "fill" | "fit"; min: number };
}

/**
 * One CSS flex item MarkswiftFlexRow sizes: `basis` the border-box px of a px/0/0% basis (CSS adds padding and
 * border to the flex base size), or null = content (measured natively).
 */
export interface FlexItem {
  grow: number;
  shrink: number;
  basis: number | null;
}
/** An admitted nowrap flex row; app mode emits MarkswiftFlexRow, fidelity keeps the children's captured widths. */
export interface FlexRow {
  items: FlexItem[];
  align: "start" | "center" | "end" | "stretch";
  /** What fidelity still reports (the pinned allocation), absent when today's output reported nothing. */
  fidelityNote?: { feature: "flex-grow" | "flex-shrink"; message: string };
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
  transform?: Transform2D & { origin?: [number, number] };
  /** `mix-blend-mode`, never `normal`. */
  blend?: BlendMode;
  /** `clip-path` basic shape. */
  clipPath?: ClipShape;
  /** `mask-image` gradient (luminance/alpha mask). */
  mask?: Paint;
  /** `visibility: hidden` — occupies space, paints nothing. */
  hidden?: boolean;
  /** Token hints: CSS custom properties the declared style referenced, plus role-qualified class hints (`bg:white`). */
  tokens?: string[];
}

/**
 * Paint deltas of an interaction state on top of `style`; only changed fields are present; a field the state
 * removes is present in its transparent/identity form. `runColors` is index-aligned with a text node's runs.
 */
export type StateStyle = Partial<
  Pick<Style, "fills" | "border" | "borderSides" | "outline" | "shadows" | "opacity" | "transform" | "filters">
> & { runColors?: Array<Color | undefined> };

export interface FontSpec {
  /** `system` families map to platform fonts by design; `custom` is a bundled family name. */
  family: { kind: "system"; design: "default" | "rounded" | "monospaced" | "serif" } | { kind: "custom"; name: string };
  size: number;
  weight: number;
  /** Optical size axis value when the family has one (Chrome uses font-size). */
  opsz?: number;
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
  font: FontSpec;
  color: Color;
  kerning?: number;
  /** CSS `text-transform`; emitters apply it (`.textCase` when every run shares it, else the literal). */
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
  /**
   * A run that paints no glyphs and only advances the line by this many points: the horizontal
   * padding/border of an inline element (`kbd`, `mark`, `code`), which a native text run cannot
   * carry as a box.
   */
  gap?: number;
  /** Inline `<a href>`: the run is a link. `action` is set for an href the app must resolve (fragment, relative path). */
  link?: { href: string; action?: Action };
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

/** One absolute path command after `unshort`/`unarc`/`abs`: viewBox user units. */
export type PathSegment =
  | ["M" | "L", number, number]
  | ["H" | "V", number]
  | ["C", number, number, number, number, number, number]
  | ["Q", number, number, number, number]
  | ["Z"];

export interface SvgPath {
  /** Absolute segments in viewBox user units; ancestor and own `transform`s are baked in. */
  path: PathSegment[];
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
  /** `clip-path="url(#id)"`: the clipPath's shapes as one path in the same space as `path`. */
  clip?: { path: PathSegment[]; eoFill?: true };
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
  /** `position: fixed`: attached to the screen, so app mode keeps it outside the root's ScrollView. */
  fixed?: true;
  /** App-mode attachment when CSS anchored the right and/or bottom edge: the host corner kept, and the node's offset from it. `offset` (top-left) stays the exact capture placement used by fidelity. */
  anchor?: { corner: "topTrailing" | "bottomLeading" | "bottomTrailing"; offset: [number, number] };
}

/** CSS min/max constraints expressed on the painted border box, in captured CSS pixels. */
export interface SizeConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

/** A callback the generated view exposes for something the design lets the user activate. */
export interface Action {
  /** One member per key: the handler source (`save()`), `#<target>` for an in-app link, else `node:<id>`. */
  key: string;
  /** Words the member is named from: handler name, `id`, `aria-label`, caption or link target — the first non-empty. */
  words: string;
  /** One line quoting the design, the member's doc comment. */
  origin: string;
  /** The element contains another control: a tap gesture on its box, not a Button (SwiftUI must not nest Buttons). */
  gesture?: true;
}

export interface SemBase extends SizeConstraints {
  /** Template path id; stable across regenerations. */
  id: string;
  frame: Rect;
  width: Size;
  height: Size;
  /**
   * Horizontal placement inside a column/block parent's content box: asymmetric/auto margins or
   * `align-self`. Default: the parent's alignment.
   */
  selfAlign?: "start" | "center" | "end";
  /** Vertical placement inside a flex row from `align-self` when it differs from the row's `align-items`. */
  selfAlignV?: "start" | "center" | "end";
  /**
   * Base writing direction of a text node whose computed `direction` is `rtl`: CoreText resolves
   * neutral characters against it. Only text carries it — container order is already measured,
   * so overriding the direction on a stack would mirror it a second time.
   */
  layoutDirection?: "rtl";
  /** top, right, bottom, left — includes border width so content lands where the browser put it. */
  padding: [number, number, number, number];
  style: Style;
  confidence: Confidence;
  diagnostics: Diagnostic[];
  overlays: Overlay[];
  /** What assistive technology is told about this node, beyond what the element itself implies. */
  a11y?: {
    /** `aria-labelledby` text, else `aria-label`, else the text of the `<label>` that names this control. */
    label?: string;
    /** A text-only element of a container role (tabpanel, region, …): `label` names a group around the Text, not its words. */
    container?: true;
    /** `aria-hidden="true"`. */
    hidden?: true;
    /** `<h1>`…`<h6>`, or `role="heading"` with `aria-level` (default 2). */
    heading?: 1 | 2 | 3 | 4 | 5 | 6;
    /** `role` = button | link | img on an element that is not already that control. */
    trait?: "isButton" | "isLink" | "isImage";
    /** `aria-valuetext`, else `aria-valuenow`; `aria-expanded` → `expanded`/`collapsed`, `aria-checked=mixed` → `mixed` when there is no value. */
    value?: string;
    /** Text of the `aria-describedby` elements, else `aria-description`. */
    hint?: string;
    /** `aria-selected`/`aria-checked`/`aria-pressed` = `true`, or an `aria-current` other than `false`. */
    selected?: true;
    /** role checkbox | switch | radio | menuitemcheckbox | menuitemradio. */
    toggle?: true;
    /** `role=radio` inside a `role=radiogroup`: the group element's id. Its radios share one selection. */
    group?: string;
    /** `aria-disabled="true"`. */
    disabled?: true;
  };
  /** `<label>`: id of the toggle/radio its tap changes. */
  labelFor?: string;
  /** Words a generated Swift name may use, from the element's own markup; see `analysis/naming.ts`. Never a path. */
  nameHint?: { words: string; source: "component" | "id" | "slot" | "aria" | "class" | "tag" };
  /** `data-markswift-field`: the design names the data field this node's content becomes. */
  field?: string;
  /**
   * What activating this element does; set on Buttons, in-app links, text fields inside a
   * `<form onsubmit>` (Return), and activatable non-controls.
   */
  action?: Action;
  /** Paint deltas of an interaction state on top of `style` (pressed: `:hover`+`:active`; focused: `:focus-visible`). */
  states?: { pressed?: StateStyle; focused?: StateStyle };
}

export interface StackNode extends SemBase {
  kind: "stack";
  axis: Axis;
  /** Uniform spacing, or one gap per adjacent pair when they differ. */
  spacing: number | number[];
  align: CrossAlign;
  distribution: Distribution;
  /** Leading offset before the first child that padding does not explain. */
  leadInset: number;
  /** Gaps taken by a CSS auto margin in a flex container — index i is before child i (children.length = after the last). Emitted as flexible Spacers; the gap's fixed part (`spacing`, or `leadInset` for 0) is their minimum. */
  autoGaps?: number[];
  /** `space-between`: the CSS gap, the Spacers' minimum length. */
  minGap?: number;
  scroll?: Axis;
  /** Fixed-size row items that reflow natively when available width changes. */
  wrap?: { columnGap: number; rowGap: number };
  /** Captured positions for wrapping combinations without a native layout mapping. */
  measured?: MeasuredLayout;
  /** Admitted CSS flex allocation (row, nowrap); see analysis/flex-row.ts. */
  flex?: FlexRow;
  children: SemNode[];
}

export interface GridNode extends SemBase {
  kind: "grid";
  columns: number;
  hSpacing: number;
  vSpacing: number;
  measured?: MeasuredLayout;
  /**
   * Admitted authored template: app mode emits MarkswiftTracks; fidelity keeps the captured geometry and reports
   * `fidelityNote`. `cells`: the `children` index of each grid item in DOM (row-major) order; `margins`: each item's
   * [top, bottom] margin, same order. `fixed`: positions in `cells` of items sized in px on both axes, which keep
   * their frames (CSS does not stretch them).
   */
  template?: GridTemplate & {
    stretch: boolean;
    fidelityNote: string;
    cells: number[];
    margins: Array<[number, number]>;
    fixed: number[];
  };
  /** Same as StackNode.scroll: the overflow axis a ScrollView covers. */
  scroll?: Axis;
  children: SemNode[];
}

export interface TextNode extends SemBase {
  kind: "text";
  /** Source element, retained so emitters can scope text-layout strategies safely. */
  sourceTag?: string;
  runs: TextRun[];
  align: "leading" | "center" | "trailing";
  lineLimit?: number;
  truncate?: boolean;
  /**
   * The browser did not soft-wrap this text (`text-wrap-mode: nowrap`, `white-space: pre`), so
   * `lineLimit` only caps its hard breaks and a long line overflows its box rather than
   * re-flowing. Unset means normal wrapping.
   */
  noWrap?: true;
  /** One word the browser cannot soft-wrap (overflow-wrap normal, no spaces, no space-free script): CSS overflows it rather than breaking mid-word, so app mode must too. */
  unbreakable?: true;
  /** Measured height of the laid-out text; lets verifiers spot line-break drift. */
  lines: number;
  /**
   * Line-box growth the browser measured beyond `lines × line-height` (sub/sup, larger inline
   * runs, `kbd` borders) on `edge`. `padded`: over 2 px, already included in `padding` (both
   * modes); smaller growth is app-only. App mode subtracts the growth native text adds on its own,
   * so it is not counted twice.
   */
  lineBoxGrowth?: { edge: "top" | "bottom"; px: number; padded: boolean };
}

export interface SvgNode extends SemBase {
  kind: "svg";
  viewBox: [number, number, number, number];
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
  /** A `data:image/svg+xml` source, parsed during analysis. */
  vector?: SvgNode;
  /** CSS `object-fit` (`scale-down` arrives as `contain`, noted): fill stretches, contain letterboxes, cover crops, none keeps the natural size. */
  contentMode: "fill" | "contain" | "cover" | "none";
  /** `object-position` as fractions of the free space (0 = left/top), when not centred. */
  position?: [number, number];
  /** `<img alt>`: the accessibility label, and the text the browser paints when the source is broken. */
  alt?: string;
  /** Computed font of the element; used when the alt text stands in for a source that cannot render. */
  font?: FontSpec;
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
  /** `colorPicker` only: the initial colour (`@value`; HTML's default for a missing/invalid value is black). */
  swatch?: Color;
  /** `@placeholder`: the prompt drawn while the field is empty. */
  placeholder?: string;
  /** `<input type>` of a text field whose keyboard and autofill differ from plain text. */
  inputType?: "email" | "tel" | "url" | "number" | "search" | "password";
  /** WHATWG autofill field name from `autocomplete`, e.g. `one-time-code`. */
  autofill?: string;
  /** `@inputmode`: the virtual keyboard the design asks for. */
  inputMode?: string;
  /** `@enterkeyhint`: the Return key's label. */
  enterKey?: string;
  /** `@checked`: initial on state of a toggle/radio. */
  checked?: boolean;
  /** Radio `@name`; radios with the same group share one selection. */
  group?: string;
  /** `@disabled`: the control is inert (Chrome also dims it, so the measured style already shows it). */
  disabled?: boolean;
  /** Numeric domain of a slider/progress/gauge, resolved from `@min`/`@max`/`@step`. */
  range?: { min: number; max: number; step?: number };
  /**
   * `<meter>` only: where the value falls against `low`/`high`/`optimum` (HTML's gauge algorithm).
   * Browsers colour the bar by this state — green, amber, red — and so does the emitter.
   */
  level?: "optimum" | "suboptimal" | "poor";
  /** Picker choices in document order (`<option>` labels). */
  options?: string[];
  /** `<a href>` as authored; fragments and relative paths have no runtime destination. */
  href?: string;
  /** `<details open>`: initial disclosure state. */
  expanded?: boolean;
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
  /** `datePicker` only: the `<input type>` it came from, which decides the components it shows. */
  dateKind?: "date" | "time" | "datetime-local" | "month" | "week";
  /** CSS `accent-color` (absent for `auto`): the tint Chrome gives checkboxes, radios, ranges and progress bars. */
  accent?: Color;
  /** Computed `appearance: none`: the author removed the native widget chrome (no select arrow). */
  appearance?: "none";
}

export type SemNode = StackNode | GridNode | TextNode | SvgNode | ImageNode | BoxNode | ControlNode;

export interface Screen {
  version: 1;
  name: string;
  source: string;
  theme: Theme;
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
