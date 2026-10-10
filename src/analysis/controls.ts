/**
 * HTML controls → `ControlNode`. Tag plus attributes decide *what* the element is; the measured
 * box, padding and paint still come from the generic inference pass, so a control looks exactly
 * like the box it replaced and only gains its interactive core.
 *
 * Nothing here reads geometry: `input[type=range]` is a slider however the design paints it.
 */
import type { LayoutNode } from "../model/layout.ts";
import { INPUT_CONTROLS, INPUT_PLACEHOLDERS } from "../html/inputs.ts";
import type { Color } from "../model/values.ts";
import { type ControlKind, type ControlNode, type Diagnostic, type FontSpec, type SemBase, type SemNode, addDiagnostic } from "../model/semantic.ts";
import { textContent } from "./text-runs.ts";

/** `controlOf`'s answer: which control an element is, with the attribute state the design shows. */
export interface ControlSpec {
  control: ControlKind;
  value?: string;
  placeholder?: string;
  inputType?: ControlNode["inputType"];
  checked?: boolean;
  group?: string;
  disabled?: boolean;
  range?: { min: number; max: number; step?: number };
  level?: ControlNode["level"];
  options?: string[];
  href?: string;
  action?: string;
  expanded?: boolean;
  files?: ControlNode["files"];
  /** Losses to record on the node (a link with no runtime destination, an unsupported input type). */
  diagnostics: Diagnostic[];
}

/**
 * The control this element is, or `undefined` when it is an ordinary box. Attribute-only: the
 * caller supplies the measured base and the built children.
 */
export function controlOf(n: LayoutNode): ControlSpec | undefined {
  const a = n.attrs;
  const diagnostics: Diagnostic[] = [];
  const disabled = "disabled" in a ? true : undefined;
  switch (n.tag) {
    case "button": {
      const spec: ControlSpec = { control: "button", diagnostics };
      if (a["onclick"]) spec.action = a["onclick"];
      if (disabled) spec.disabled = true;
      return spec;
    }
    case "a": {
      const href = a["href"];
      if (href === undefined) return undefined;
      const spec: ControlSpec = { control: "link", href, diagnostics };
      // An absolute URL has a destination outside the app and becomes a `Link`. Everything else
      // — `#`, `#section`, `/path` — is navigation only the app can perform, so the element
      // becomes a button over the same callback an `onclick` would get, named after whatever the
      // design called the target so the placeholder says which link it was.
      if (!ABSOLUTE_URL.test(href)) {
        spec.action = a["onclick"] || `#${targetName(href, n)}`;
        addDiagnostic(diagnostics, "approximated", "a", `<a href="${href}"> has no runtime destination → Button over a placeholder action`);
      }
      return spec;
    }
    case "textarea": {
      const spec: ControlSpec = { control: "textEditor", diagnostics };
      const text = textContent(n).trim();
      if (text) spec.value = text;
      if (a["placeholder"]) spec.placeholder = a["placeholder"];
      if (disabled) spec.disabled = true;
      return spec;
    }
    case "select": {
      const options: string[] = [];
      let selected: string | undefined;
      for (const o of optionsOf(n)) {
        // `@label` overrides the element's text; the text itself may be missing from the snapshot.
        const label = (o.attrs["label"] ?? textContent(o)).trim();
        if (label) options.push(label);
        if ("selected" in o.attrs) selected = label;
      }
      const spec: ControlSpec = { control: "picker", options, diagnostics };
      // A closed `<select>` shows the selected option, or the first one when the page names none.
      const shown = selected || options[0];
      if (shown) spec.value = shown;
      // Chrome lays the options out in the popup, not in the page, so the snapshot may hold none.
      if (!options.length) addDiagnostic(diagnostics, "approximated", "select", "<select> option labels are not in the snapshot → picker with no choices");
      if (a["multiple"] !== undefined || (a["size"] !== undefined && Number(a["size"]) > 1)) addDiagnostic(diagnostics, "approximated", "select", "<select multiple/size> list box → menu picker");
      if (disabled) spec.disabled = true;
      return spec;
    }
    case "details": {
      const spec: ControlSpec = { control: "disclosure", diagnostics };
      if ("open" in a) spec.expanded = true;
      return spec;
    }
    case "progress":
    case "meter": {
      const min = num(a["min"]) ?? 0;
      const max = num(a["max"]) ?? 1;
      const spec: ControlSpec = { control: n.tag === "progress" ? "progress" : "gauge", range: { min, max: Math.max(max, min) }, diagnostics };
      const v = a["value"];
      if (v !== undefined && num(v) !== undefined) spec.value = v;
      else if (n.tag === "progress") addDiagnostic(diagnostics, "approximated", "progress", "indeterminate <progress> → animated bar");
      if (n.tag === "meter") spec.level = meterLevel(num(a["value"]) ?? 0, min, Math.max(max, min), num(a["low"]), num(a["high"]), num(a["optimum"]));
      return spec;
    }
    case "input": {
      const type = (a["type"] ?? "text").toLowerCase();
      if (Object.hasOwn(INPUT_PLACEHOLDERS, type)) return undefined;
      // HTML's missing/invalid value default for `@type` is Text, so a type nobody recognises is
      // a text field — and the box the capture measured is the one Chrome gave a text field.
      const control = Object.hasOwn(INPUT_CONTROLS, type) ? INPUT_CONTROLS[type]! : "textField";
      if (!Object.hasOwn(INPUT_CONTROLS, type)) addDiagnostic(diagnostics, "approximated", "input", `<input type="${type}"> is not a type HTML defines → text field, which is what the browser rendered`);
      const spec: ControlSpec = { control, diagnostics };
      if (/^(email|tel|url|number|search|password)$/.test(type)) spec.inputType = type as NonNullable<ControlNode["inputType"]>;
      if (control === "toggle" || control === "radio") {
        if ("checked" in a) spec.checked = true;
        // A radio's `@name` groups it; its `@value` (HTML default "on") tells the group which is selected.
        if (control === "radio") {
          if (a["name"]) spec.group = a["name"];
          spec.value = a["value"] ?? "on";
        }
      } else if (a["value"] !== undefined) spec.value = a["value"];
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
        addDiagnostic(diagnostics, "approximated", "input: file", '<input type="file"> → Button presenting .fileImporter; Chrome\'s "Choose file" caption and filename text are shadow DOM the capture cannot reach');
      }
      if (control === "button" && a["onclick"]) spec.action = a["onclick"];
      if (disabled) spec.disabled = true;
      return spec;
    }
    default:
      return undefined;
  }
}

/** A control's laid-out surroundings, as the generic container path produced them. */
export interface ControlParts {
  /** The box the generic path would have painted: frame, padding, style, diagnostics. */
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
  const { control, diagnostics, ...state } = spec;
  const base = parts.base;
  base.diagnostics.push(...diagnostics);
  let label: SemNode | undefined;
  const kids = parts.children.filter((c) => {
    if (control === "disclosure" && c.node.tag === "summary" && !label) {
      label = c.sem;
      return false;
    }
    return true;
  });
  // Document order is the DOM's; measured order is what the reader sees (CSS `order`, floats).
  const content = [...kids.map((c) => c.sem), ...parts.texts].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
  // A control whose whole content is its own text (a button's caption, a link's label): that text
  // is the element's line box, so it inherits the measured content box. Without it the control
  // would shrink to the glyphs and lose the browser's centring inside the box.
  const only = content.length === 1 ? content[0] : undefined;
  if (only && only.kind === "text" && !parts.children.length) {
    const [pt, pr, pb, pl] = base.padding;
    only.frame = { x: base.frame.x + pl, y: base.frame.y + pt, w: base.frame.w - pl - pr, h: base.frame.h - pt - pb };
    if (base.width.kind !== "hug") only.width = { kind: "fill" };
  }
  const node: ControlNode = { ...base, kind: "control", control, content, ...state };
  if (label) node.label = label;
  if (parts.font && SELF_DRAWN_TEXT[control]) {
    node.font = parts.font;
    if (parts.color) node.color = parts.color;
  }
  return node;
}

/** `<label>` ↔ control (HTML: `for` names an element id; otherwise the first control inside). */
export interface LabelIndex {
  /** Control element → its label's text (the label's text content without the control's own). */
  text: Map<LayoutNode, string>;
  /** Label element → the enabled toggle/radio element a tap on the label changes. */
  activates: Map<LayoutNode, LayoutNode>;
}

export function labelIndex(root: LayoutNode): LabelIndex {
  const byId = new Map<string, LayoutNode>();
  const labels: LayoutNode[] = [];
  const index = (n: LayoutNode) => {
    const id = n.attrs["id"];
    if (id && !byId.has(id)) byId.set(id, n);
    if (n.tag === "label") labels.push(n);
    n.children.forEach(index);
  };
  index(root);
  const out: LabelIndex = { text: new Map(), activates: new Map() };
  const firstControl = (n: LayoutNode): LayoutNode | undefined => {
    for (const c of n.children) {
      const hit = controlOf(c) ? c : firstControl(c);
      if (hit) return hit;
    }
  };
  const textOf = (n: LayoutNode, skip: LayoutNode): string => (n === skip ? "" : n.tag === "#text" ? (n.text ?? "") : n.children.map((c) => textOf(c, skip)).join(""));
  for (const label of labels) {
    const target = label.attrs["for"] !== undefined ? byId.get(label.attrs["for"]) : firstControl(label);
    if (!target) continue;
    // ponytail: first label wins when several name one control; HTML concatenates them. Join them if a design needs it.
    const text = textOf(label, target).replace(/\s+/g, " ").trim();
    if (text && !out.text.has(target)) out.text.set(target, text);
    const spec = controlOf(target);
    if ((spec?.control === "toggle" || spec?.control === "radio") && !spec.disabled) out.activates.set(label, target);
  }
  return out;
}

/** A URL with a scheme: the only `href` the generated view can hand to the system. */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

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
  const name = fragment || path || textContent(n).trim() || n.id || "link";
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

/** `<option>` children, including those inside `<optgroup>`. */
function optionsOf(n: LayoutNode): LayoutNode[] {
  const out: LayoutNode[] = [];
  for (const c of n.children) {
    if (c.tag === "option") out.push(c);
    else if (c.tag === "optgroup") out.push(...optionsOf(c));
  }
  return out;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
