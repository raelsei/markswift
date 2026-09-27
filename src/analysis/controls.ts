/**
 * HTML controls → `ControlNode`. Tag plus attributes decide *what* the element is; the measured
 * box, padding and paint still come from the generic inference pass, so a control looks exactly
 * like the box it replaced and only gains its interactive core.
 *
 * Tags and attributes determine control identity. Select metadata also retains measured row paint;
 * `input[type=range]` remains a slider however the design paints it.
 */
import type { LayoutNode } from "../model/layout.ts";
import { INPUT_CONTROLS, INPUT_PLACEHOLDERS } from "../html/inputs.ts";
import type { Color } from "../css/index.ts";
import { nativeExternalURL } from "./link-destination.ts";
import { applyDateInput } from "./date-input.ts";
import { applyRadioInput } from "./radio-input.ts";
import { applySelectInput } from "./select-input.ts";
import { applyDisclosureInput } from "./disclosure-input.ts";
import { reframeText } from "./text-line-box.ts";
import { markColorScheme } from "./boolean-paint.ts";
import type { ControlKind, ControlNode, FontSpec, SemBase, SemNode, TextTransform } from "../model/semantic.ts";

/** `controlOf`'s answer: which control an element is, with the attribute state the design shows. */
export interface ControlSpec {
  control: ControlKind;
  value?: string;
  captionTransform?: TextTransform;
  placeholder?: string;
  checked?: boolean;
  markColorScheme?: ControlNode["markColorScheme"];
  radioGroup?: string;
  disabled?: boolean;
  readOnly?: boolean;
  dateKind?: ControlNode["dateKind"];
  dateComponents?: ControlNode["dateComponents"];
  range?: { min: number; max: number; step?: number };
  level?: ControlNode["level"];
  options?: string[];
  choices?: ControlNode["choices"];
  selectedChoice?: number;
  selectList?: ControlNode["selectList"];
  selectedChoices?: number[];
  selectRows?: ControlNode["selectRows"];
  selectStatic?: boolean;
  href?: string;
  action?: string;
  expanded?: boolean;
  disclosureLayout?: ControlNode["disclosureLayout"];
  files?: ControlNode["files"];
  /** Losses to record on the node (a link with no runtime destination, an unsupported input type). */
  notes: string[];
}

/**
 * The control this element is, or `undefined` when it is an ordinary box. Attribute-only: the
 * caller supplies the measured base and rendered children. Select choices carry their own rows.
 */
export function controlOf(n: LayoutNode): ControlSpec | undefined {
  const a = n.attrs;
  const notes: string[] = [];
  const disabled = "disabled" in a ? true : undefined;
  switch (n.tag) {
    case "button": {
      const spec: ControlSpec = { control: "button", notes };
      if (a["onclick"]) spec.action = a["onclick"];
      if (disabled) spec.disabled = true;
      return spec;
    }
    case "a": {
      const href = a["href"];
      if (href === undefined) return undefined;
      const destination = nativeExternalURL(href);
      const spec: ControlSpec = { control: "link", href: destination ?? href, notes };
      // A supported external URL becomes a `Link`. Everything else — routes, fragments and
      // unsupported schemes — needs navigation only the app can perform, so the element
      // becomes a button over the same callback an `onclick` would get, named after whatever the
      // design called the target so the placeholder says which link it was.
      if (!destination) {
        spec.action = a["onclick"] || `#${targetName(href, n)}`;
        notes.push(`approximated: <a href="${href}"> has no supported runtime destination → Button over a placeholder action`);
      }
      return spec;
    }
    case "textarea": {
      const spec: ControlSpec = { control: "textEditor", notes };
      applyReadOnly(n, spec);
      // CDP's live textValue is normalized onto `value`; child text is only the authored default.
      const text = a["value"] ?? textOf(n).trim();
      if (text) spec.value = text;
      if (a["placeholder"]) spec.placeholder = a["placeholder"];
      if (disabled) spec.disabled = true;
      return spec;
    }
    case "select": {
      const spec: ControlSpec = { control: "picker", notes };
      applySelectInput(n, spec);
      if (disabled) spec.disabled = true;
      return spec;
    }
    case "details": {
      const spec: ControlSpec = { control: "disclosure", notes };
      applyDisclosureInput(n, spec);
      return spec;
    }
    case "progress":
    case "meter": {
      const min = num(a["min"]) ?? 0;
      const max = num(a["max"]) ?? 1;
      const spec: ControlSpec = { control: n.tag === "progress" ? "progress" : "gauge", range: { min, max: Math.max(max, min) }, notes };
      const v = a["value"];
      if (v !== undefined && num(v) !== undefined) spec.value = v;
      else if (n.tag === "progress") notes.push("approximated: indeterminate <progress> → animated bar");
      if (n.tag === "meter") spec.level = meterLevel(num(a["value"]) ?? 0, min, Math.max(max, min), num(a["low"]), num(a["high"]), num(a["optimum"]));
      return spec;
    }
    case "input": {
      const type = (a["type"] ?? "text").toLowerCase();
      if (Object.hasOwn(INPUT_PLACEHOLDERS, type)) return undefined;
      // HTML's missing/invalid value default for `@type` is Text, so a type nobody recognises is
      // a text field — and the box the capture measured is the one Chrome gave a text field.
      const control = Object.hasOwn(INPUT_CONTROLS, type) ? INPUT_CONTROLS[type]! : "textField";
      if (!Object.hasOwn(INPUT_CONTROLS, type)) notes.push(`approximated: <input type="${type}"> is not a type HTML defines → text field, which is what the browser rendered`);
      const spec: ControlSpec = { control, notes };
      applyReadOnly(n, spec);
      if (control === "toggle" || control === "radio") {
        if ("checked" in a) spec.checked = true;
        spec.markColorScheme = markColorScheme(n, notes);
      } else if (a["value"] !== undefined) spec.value = a["value"];
      else if (type === "submit") spec.value = "Submit";
      else if (type === "reset") spec.value = "Reset";
      if (control === "datePicker") applyDateInput(n, type as NonNullable<ControlNode["dateKind"]>, spec);
      if (control === "radio") applyRadioInput(n, spec);
      if (type === "submit") notes.push('approximated: <input type="submit"> form submission and validation require an app action');
      if (type === "reset") notes.push('approximated: <input type="reset"> form reset requires an app action');
      if (type === "button" || type === "submit" || type === "reset") {
        const transform = n.styles["text-transform"];
        if (transform === "uppercase" || transform === "lowercase" || transform === "capitalize") {
          spec.captionTransform = transform;
          if (transform === "capitalize") notes.push("approximated: text-transform: capitalize on input button caption is not translated");
        }
      }
      if (control === "slider") {
        const min = num(a["min"]) ?? 0;
        const max = num(a["max"]) ?? 100;
        spec.range = { min, max: Math.max(max, min) };
        const step = num(a["step"]);
        if (step !== undefined && step > 0) spec.range.step = step;
      }
      if (a["placeholder"]) spec.placeholder = a["placeholder"];
      if (type === "file") {
        const accept = (a["accept"] ?? "").split(",").map((t) => t.trim()).filter(Boolean);
        spec.files = { accept };
        if ("multiple" in a) spec.files.multiple = true;
        // Chrome draws the button caption and the chosen-file text in the input's shadow DOM,
        // which the snapshot cannot reach, so the generated button keeps the box and loses them.
        notes.push('approximated: <input type="file"> → Button presenting .fileImporter; Chrome\'s "Choose file" caption and filename text are shadow DOM the capture cannot reach');
      }
      if (control === "button" && a["onclick"]) spec.action = a["onclick"];
      if (disabled) spec.disabled = true;
      return spec;
    }
    default:
      return undefined;
  }
}

function applyReadOnly(node: LayoutNode, spec: ControlSpec): void {
  if (node.attrs.readonly === undefined || !["textField", "secureField", "textEditor", "datePicker"].includes(spec.control)) return;
  spec.readOnly = true;
  spec.notes.push(`approximated: readonly <${node.tag}> → noneditable text; browser selection and focus behavior are not translated`);
}

/** A control's laid-out surroundings, as the generic container path produced them. */
export interface ControlParts {
  /** The box the generic path would have painted: frame, padding, style, notes. */
  base: SemBase;
  /** Element children, in document order, already built. */
  children: Array<{ node: LayoutNode; sem: SemNode }>;
  /** The element's own text, one node per run group. */
  texts: SemNode[];
  /** Font and colour of the element's own text, for the value the control draws itself. */
  font?: FontSpec;
  color?: Color;
}

/**
 * The control node: `spec`'s attribute state on `parts.base`'s measured box. Children become
 * `content` in measured order (a `<summary>` becomes the disclosure's `label` instead).
 */
export function buildControl(spec: ControlSpec, parts: ControlParts): ControlNode {
  const { control, notes, ...state } = spec;
  const base = parts.base;
  base.notes.push(...notes);
  let label: SemNode | undefined;
  const kids = parts.children.filter((c) => {
    if (control === "disclosure" && c.node.tag === "summary" && !label) {
      label = c.sem;
      return false;
    }
    return true;
  });
  // Document order is the DOM's; measured order is what the reader sees (CSS `order`, floats).
  const content = control === "disclosure" && state.disclosureLayout?.contentAvailable === false ? []
    : [...kids.map((c) => c.sem), ...parts.texts].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
  // A control whose whole content is its own text (a button's caption, a link's label): that text
  // is the element's line box, so it inherits the measured content box. Without it the control
  // would shrink to the glyphs and lose the browser's centring inside the box.
  const only = content.length === 1 ? content[0] : undefined;
  if (only && only.kind === "text" && !parts.children.length) {
    const [pt, pr, pb, pl] = base.padding;
    reframeText(only, { x: base.frame.x + pl, y: base.frame.y + pt, w: base.frame.w - pl - pr, h: base.frame.h - pt - pb });
    if (base.width.kind !== "hug") only.width = { kind: "fill" };
  }
  const node: ControlNode = { ...base, kind: "control", control, content, ...state };
  // HTML size/multiple provides an intrinsic viewport, not the flexible ideal height of a
  // SwiftUI ScrollView/GeometryReader. Preserve that viewport while its option content scrolls.
  if (node.selectList && node.height.kind === "hug") node.height = { kind: "fixed", px: node.frame.h };
  if (label) node.label = label;
  if (parts.font && (SELF_DRAWN_TEXT[control] || (control === "button" && state.value !== undefined && !state.files))) {
    node.font = parts.font;
    if (parts.color) node.color = parts.color;
  }
  return node;
}

/**
 * What the design called a link's target, for the name of the placeholder action it becomes:
 * the fragment (`#pricing` → `pricing`), else the last path segment (`/docs/install` →
 * `install`), else the link's own text (`<a href="#">Home</a>` → `Home`), else its identity.
 * A bare `#` and a named target therefore land on different callbacks.
 */
function targetName(href: string, n: LayoutNode): string {
  const hash = href.indexOf("#");
  const fragment = hash < 0 ? "" : href.slice(hash + 1);
  const path = (hash < 0 ? href : href.slice(0, hash)).split("?")[0]!.split("/").filter(Boolean).pop() ?? "";
  const name = fragment || path || textOf(n).trim() || n.id || "link";
  return name.slice(0, 40);
}

/**
 * HTML's `<meter>` gauge algorithm: the value is in its optimum band, one band away, or in the
 * worst one. `low`/`high` default to the ends of the range, `optimum` to its middle.
 */
function meterLevel(value: number, min: number, max: number, low?: number, high?: number, optimum?: number): NonNullable<ControlNode["level"]> {
  const lo = Math.min(Math.max(low ?? min, min), max);
  const hi = Math.min(Math.max(high ?? max, lo), max);
  const opt = Math.min(Math.max(optimum ?? (min + max) / 2, min), max);
  const v = Math.min(Math.max(value, min), max);
  if (opt < lo) return v <= lo ? "optimum" : v <= hi ? "suboptimal" : "poor"; // lower is better
  if (opt > hi) return v >= hi ? "optimum" : v >= lo ? "suboptimal" : "poor"; // higher is better
  return v >= lo && v <= hi ? "optimum" : "suboptimal";
}

/** Controls that paint text of their own (from `value`/`placeholder`) rather than child nodes. */
const SELF_DRAWN_TEXT: Partial<Record<ControlKind, true>> = { textField: true, secureField: true, textEditor: true, picker: true, datePicker: true, stepper: true };

/** Concatenated text of an element's subtree, as the snapshot laid it out. */
function textOf(n: LayoutNode): string {
  if (n.tag === "#text") return n.text ?? "";
  return n.children.map(textOf).join("");
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
