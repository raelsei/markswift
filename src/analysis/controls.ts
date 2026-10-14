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
import { parseColor } from "../css/index.ts";
import {
  type Action,
  type ControlKind,
  type ControlNode,
  type Diagnostic,
  type FontSpec,
  type PickerOption,
  type SemBase,
  type SemNode,
  addDiagnostic,
} from "../model/semantic.ts";
import { isActivatableRole, isToggleRole } from "../model/interactive.ts";
import { textContent } from "./text-runs.ts";

/** `save()` / `return app.save(event)` → `save` / `app.save`; "" when the handler is not a plain call. */
function handlerName(src: string): string {
  return /^\s*(?:return\s+)?([A-Za-z_$][\w$.]*)\s*\(/.exec(src)?.[1] ?? "";
}
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** An element's own action: its `onclick`, else the submit handler of its form, else a member of its own. */
export function elementAction(n: LayoutNode, caption: string, form?: LayoutNode): Action {
  const onclick = n.attrs["onclick"]?.trim();
  if (onclick)
    return {
      key: onclick,
      words: handlerName(onclick) || n.attrs["id"] || caption,
      origin: `\`onclick="${oneLine(onclick)}"\` in the design.`,
    };
  const submit = form && submitAction(form);
  if (submit) return submit;
  const role = n.attrs["role"] ? ` role="${oneLine(n.attrs["role"])}"` : "";
  const quoted = caption ? ` "${oneLine(caption).slice(0, 40)}"` : "";
  return {
    key: `node:${n.id ?? ""}`,
    words: n.attrs["id"] || n.attrs["aria-label"] || caption,
    origin: `\`<${n.tag}${role}>\`${quoted} in the design has no handler; fill in what it does.`,
  };
}

/** `<form onsubmit>`: what its submit buttons and Return in its fields run. */
export function submitAction(form: LayoutNode): Action | undefined {
  const src = form.attrs["onsubmit"]?.trim();
  if (!src) return undefined;
  return {
    key: src,
    words: handlerName(src) || form.attrs["id"] || "submit",
    origin: `\`<form onsubmit="${oneLine(src)}">\` in the design: its submit button and Return in its fields.`,
  };
}

/** An `<a href>` the app must resolve itself (fragment, relative path); undefined for an absolute URL. */
export function linkAction(a: LayoutNode): Action | undefined {
  const href = a.attrs["href"] ?? "";
  if (ABSOLUTE_URL.test(href)) return undefined;
  if (a.attrs["onclick"]?.trim()) return elementAction(a, "");
  const target = targetName(href, a);
  return {
    key: `#${target}`,
    words: target,
    origin: `\`<a href="${oneLine(href)}">\` → \`${oneLine(target)}\` in the design: in-page navigation; fill in the destination.`,
  };
}

/** `onclick`, or an activatable ARIA role, on an element that is not itself a control. */
function activatable(n: LayoutNode): boolean {
  return !!n.attrs["onclick"]?.trim() || isActivatableRole(n.attrs["role"]);
}
function containsControl(n: LayoutNode): boolean {
  return n.children.some((c) => controlOf(c) !== undefined || activatable(c) || containsControl(c));
}
/**
 * The action of an element the design makes activatable without being a control (`<div role=button
 * onclick>`, `<li onclick>`). It stays the view it is — same layout — and the emitter wraps it in a
 * Button; one that contains another control gets a tap gesture instead.
 */
export function activatableAction(n: LayoutNode): Action | undefined {
  if (!activatable(n)) return undefined;
  const action = elementAction(n, textContent(n).trim());
  return containsControl(n) ? { ...action, gesture: true } : action;
}

/** `controlOf`'s answer: which control an element is, with the attribute state the design shows. */
export interface ControlSpec {
  control: ControlKind;
  value?: string;
  swatch?: Color;
  placeholder?: string;
  inputType?: ControlNode["inputType"];
  autofill?: string;
  inputMode?: string;
  enterKey?: string;
  checked?: boolean;
  group?: string;
  disabled?: boolean;
  range?: { min: number; max: number; step?: number };
  level?: ControlNode["level"];
  options?: PickerOption[];
  href?: string;
  action?: Action;
  expanded?: boolean;
  files?: ControlNode["files"];
  dateKind?: ControlNode["dateKind"];
  /** Losses to record on the node (a link with no runtime destination, an unsupported input type). */
  diagnostics: Diagnostic[];
}

/** HTML's `inputmode` and `enterkeyhint` keywords; anything else is ignored, as the browser ignores it. */
const INPUT_MODES: Readonly<Record<string, true>> = {
  none: true,
  text: true,
  decimal: true,
  numeric: true,
  tel: true,
  search: true,
  email: true,
  url: true,
};
const ENTER_KEYS: Readonly<Record<string, true>> = {
  enter: true,
  done: true,
  go: true,
  next: true,
  previous: true,
  search: true,
  send: true,
};
/** The field name of an `autocomplete` value (`section-a shipping street-address` → `street-address`); undefined for on/off/empty. */
function autofillField(v: string | undefined): string | undefined {
  const last = (v ?? "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t && t !== "webauthn")
    .at(-1);
  return last && last !== "on" && last !== "off" ? last : undefined;
}

/**
 * The control this element is, or `undefined` when it is an ordinary box. Attribute-only: the
 * caller supplies the measured base and the built children; `labels` adds what the element's
 * surroundings decide (its form owner, a `<fieldset disabled>` around it).
 */
export function controlOf(n: LayoutNode, labels?: LabelIndex): ControlSpec | undefined {
  const a = n.attrs;
  const diagnostics: Diagnostic[] = [];
  const form = labels?.forms.get(n);
  // A native control the design marks disabled for assistive technology behaves disabled.
  const disabled = "disabled" in a || a["aria-disabled"] === "true" || labels?.disabled.has(n) ? true : undefined;
  switch (n.tag) {
    case "button": {
      const spec: ControlSpec = { control: "button", diagnostics };
      // HTML: a `<button>` without `type` submits.
      spec.action = elementAction(n, textContent(n).trim(), /^(submit)?$/i.test(a["type"] ?? "") ? form : undefined);
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
        spec.action = linkAction(n);
        addDiagnostic(
          diagnostics,
          "approximated",
          "a",
          `<a href="${href}"> has no runtime destination → Button over a placeholder action`,
        );
      }
      return spec;
    }
    case "textarea": {
      const spec: ControlSpec = { control: "textEditor", diagnostics };
      // `@value`: the live text when the page's script changed it (`browser/snapshot.ts`).
      const text = (a["value"] ?? textContent(n)).trim();
      if (text) spec.value = text;
      if (a["placeholder"]) spec.placeholder = a["placeholder"];
      if (disabled) spec.disabled = true;
      return spec;
    }
    case "select": {
      const options: PickerOption[] = [];
      let selected: string | undefined;
      let enabled: string | undefined;
      const all = optionsOf(n);
      for (const { option: o, group } of all) {
        // `@label` overrides the element's text; the text itself may be missing from the snapshot.
        const label = (o.attrs["label"] ?? textContent(o)).trim();
        if ("selected" in o.attrs) selected = label;
        const off = "disabled" in o.attrs || (group !== undefined && "disabled" in group.attrs);
        enabled ??= off || !label ? undefined : label;
        // A `hidden` option (a "Choose…" placeholder) can be shown while closed but is no choice in the menu.
        if (!label || "hidden" in o.attrs || (group !== undefined && "hidden" in group.attrs)) continue;
        const option: PickerOption = { label };
        if (off) option.disabled = true;
        const heading = group?.attrs["label"]?.trim();
        if (heading) option.group = heading;
        options.push(option);
      }
      const spec: ControlSpec = { control: "picker", options, diagnostics };
      // A closed `<select>` shows the selected option; with none selected, the browser selects the first enabled one.
      const shown = selected || enabled || options[0]?.label;
      if (shown) spec.value = shown;
      // Chrome lays the options out in the popup, not in the page, so the snapshot may hold none.
      if (!all.length)
        addDiagnostic(
          diagnostics,
          "approximated",
          "select",
          "<select> option labels are not in the snapshot → picker with no choices",
        );
      if (a["multiple"] !== undefined || (a["size"] !== undefined && Number(a["size"]) > 1))
        addDiagnostic(diagnostics, "approximated", "select", "<select multiple/size> list box → menu picker");
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
      const spec: ControlSpec = {
        control: n.tag === "progress" ? "progress" : "gauge",
        range: { min, max: Math.max(max, min) },
        diagnostics,
      };
      const v = a["value"];
      if (v !== undefined && num(v) !== undefined) spec.value = v;
      else if (n.tag === "progress")
        addDiagnostic(diagnostics, "approximated", "progress", "indeterminate <progress> → animated bar");
      if (n.tag === "meter")
        spec.level = meterLevel(
          num(a["value"]) ?? 0,
          min,
          Math.max(max, min),
          num(a["low"]),
          num(a["high"]),
          num(a["optimum"]),
        );
      return spec;
    }
    case "input": {
      const type = (a["type"] ?? "text").toLowerCase();
      if (Object.hasOwn(INPUT_PLACEHOLDERS, type)) return undefined;
      // HTML's missing/invalid value default for `@type` is Text, so a type nobody recognises is
      // a text field — and the box the capture measured is the one Chrome gave a text field.
      const control = Object.hasOwn(INPUT_CONTROLS, type) ? INPUT_CONTROLS[type]! : "textField";
      if (!Object.hasOwn(INPUT_CONTROLS, type))
        addDiagnostic(
          diagnostics,
          "approximated",
          "input",
          `<input type="${type}"> is not a type HTML defines → text field, which is what the browser rendered`,
        );
      const spec: ControlSpec = { control, diagnostics };
      if (/^(email|tel|url|number|search|password)$/.test(type))
        spec.inputType = type as NonNullable<ControlNode["inputType"]>;
      if (control === "toggle" || control === "radio") {
        if ("checked" in a) spec.checked = true;
        // A radio's `@name` groups it; its `@value` (HTML default "on") tells the group which is selected.
        if (control === "radio") {
          if (a["name"]) spec.group = a["name"];
          spec.value = a["value"] ?? "on";
        }
      } else if (a["value"] !== undefined) spec.value = a["value"];
      // Chrome paints a submit/reset button's caption from `@value`, else its own default label.
      if ((type === "submit" || type === "reset") && spec.value === undefined)
        spec.value = type === "submit" ? "Submit" : "Reset";
      if (control === "datePicker") {
        spec.dateKind = type as NonNullable<ControlNode["dateKind"]>;
        if (type === "month" || type === "week")
          addDiagnostic(
            diagnostics,
            "approximated",
            "input: date",
            `<input type="${type}"> → DatePicker(.date); iOS has no ${type} picker`,
          );
      }
      if (control === "colorPicker") spec.swatch = parseColor(a["value"]) ?? { r: 0, g: 0, b: 0, a: 1 };
      if (control === "slider") {
        const min = num(a["min"]) ?? 0;
        const max = num(a["max"]) ?? 100;
        spec.range = { min, max: Math.max(max, min) };
        const step = num(a["step"]);
        if (step !== undefined && step > 0) spec.range.step = step;
      }
      if (a["placeholder"]) spec.placeholder = a["placeholder"];
      if (type === "file") {
        const accept = (a["accept"] ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        spec.files = { accept };
        if ("multiple" in a) spec.files.multiple = true;
        // Chrome draws the button caption and the chosen-file text in the input's shadow DOM,
        // which the snapshot cannot reach, so the generated button keeps the box and loses them.
        addDiagnostic(
          diagnostics,
          "approximated",
          "input: file",
          '<input type="file"> → Button presenting .fileImporter; Chrome\'s "Choose file" caption and filename text are shadow DOM the capture cannot reach',
        );
      }
      if (control === "button" && type !== "file") {
        const caption = a["value"] ?? (type === "submit" ? "Submit" : type === "reset" ? "Reset" : "");
        spec.action = elementAction(n, caption, type === "submit" ? form : undefined);
      }
      if (control === "textField" || control === "secureField") {
        if (form) {
          const submit = submitAction(form);
          if (submit) spec.action = submit;
        }
        const autofill = autofillField(a["autocomplete"]);
        if (autofill) spec.autofill = autofill;
        const mode = a["inputmode"]?.trim().toLowerCase();
        if (mode && Object.hasOwn(INPUT_MODES, mode)) spec.inputMode = mode;
        const enter = a["enterkeyhint"]?.trim().toLowerCase();
        if (enter && Object.hasOwn(ENTER_KEYS, enter)) spec.enterKey = enter;
      }
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
  /** Computed `appearance` and `accent-color` of the element. */
  appearance?: string;
  accent?: Color;
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
  // A picker's options and a text area's text are already its `options`/`value`: no content.
  const content =
    control === "picker" || control === "textEditor"
      ? []
      : [...kids.map((c) => c.sem), ...parts.texts].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
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
  // An input button's caption is its `value`, painted by the control itself.
  const caption = control === "button" && state.value !== undefined && !state.files;
  if (parts.font && (SELF_DRAWN_TEXT[control] || caption)) {
    node.font = parts.font;
    if (parts.color) node.color = parts.color;
  }
  // Checkboxes, radios and ranges with native appearance ignore the author's box paint (Chrome
  // draws its own widget there); `appearance: none` hands the box back to CSS.
  if (parts.appearance === "none") node.appearance = "none";
  else if (control === "toggle" || control === "radio" || control === "slider") {
    node.style = { ...node.style, fills: [] };
    delete node.style.border;
    delete node.style.borderSides;
  }
  if (parts.accent) node.accent = parts.accent;
  return node;
}

/** `<label>` ↔ control (HTML: `for` names an element id; otherwise the first control inside). */
export interface LabelIndex {
  /** Control element → its label's text (the label's text content without the control's own). */
  text: Map<LayoutNode, string>;
  /** Label element → the enabled toggle/radio element (native, or an ARIA toggle role) a tap on the label changes. */
  activates: Map<LayoutNode, LayoutNode>;
  /** `<input>`/`<button>` → its form owner (HTML: the `<form>` its `@form` names, else its nearest ancestor `<form>`). */
  forms: Map<LayoutNode, LayoutNode>;
  /** Form controls a `<fieldset disabled>` disables (everything in it but its first `<legend>`). */
  disabled: Set<LayoutNode>;
  /** First element per DOM `id`. */
  byId: Map<string, LayoutNode>;
  /** `role=radio` element → the id of its nearest `role=radiogroup` ancestor. */
  radioGroups: Map<LayoutNode, string>;
}

/** Elements a `<fieldset disabled>` disables (HTML: form-associated, listed elements). */
const FIELDSET_DISABLES: Readonly<Record<string, true>> = { button: true, input: true, select: true, textarea: true };

export function labelIndex(root: LayoutNode): LabelIndex {
  const byId = new Map<string, LayoutNode>();
  const labels: LayoutNode[] = [];
  const forms = new Map<LayoutNode, LayoutNode>();
  const disabled = new Set<LayoutNode>();
  const radioGroups = new Map<LayoutNode, string>();
  const external: LayoutNode[] = [];
  const index = (n: LayoutNode, form?: LayoutNode, group?: LayoutNode, off = false) => {
    const id = n.attrs["id"];
    if (id && !byId.has(id)) byId.set(id, n);
    if (n.tag === "label") labels.push(n);
    const owner = n.tag === "form" ? n : form;
    if (n.tag === "button" || n.tag === "input") {
      if (n.attrs["form"] !== undefined) external.push(n);
      else if (owner) forms.set(n, owner);
    }
    if (off && FIELDSET_DISABLES[n.tag]) disabled.add(n);
    // A disabled fieldset's first legend stays enabled — unless an outer fieldset disables it.
    const fieldset = n.tag === "fieldset" && "disabled" in n.attrs;
    const legend = fieldset ? n.children.find((c) => c.tag === "legend") : undefined;
    const role = n.attrs["role"]?.trim().toLowerCase();
    if (role === "radio" && group) radioGroups.set(n, group.id ?? "");
    for (const c of n.children) index(c, owner, role === "radiogroup" ? n : group, off || (fieldset && c !== legend));
  };
  index(root);
  for (const n of external) {
    const owner = byId.get(n.attrs["form"]!);
    if (owner?.tag === "form") forms.set(n, owner);
  }
  const out: LabelIndex = { text: new Map(), activates: new Map(), forms, disabled, byId, radioGroups };
  const firstControl = (n: LayoutNode): LayoutNode | undefined => {
    for (const c of n.children) {
      const hit = controlOf(c) ? c : firstControl(c);
      if (hit) return hit;
    }
  };
  const textOf = (n: LayoutNode, skip: LayoutNode): string =>
    n === skip ? "" : n.tag === "#text" ? (n.text ?? "") : n.children.map((c) => textOf(c, skip)).join("");
  for (const label of labels) {
    const target = label.attrs["for"] !== undefined ? byId.get(label.attrs["for"]) : firstControl(label);
    if (!target) continue;
    // ponytail: first label wins when several name one control; HTML concatenates them. Join them if a design needs it.
    const text = textOf(label, target).replace(/\s+/g, " ").trim();
    if (text && !out.text.has(target)) out.text.set(target, text);
    const spec = controlOf(target, out);
    // An ARIA toggle is a `<button>` or an activatable box; HTML: a label's tap clicks its button too.
    const toggle = spec
      ? spec.control === "toggle" ||
        spec.control === "radio" ||
        (spec.control === "button" && isToggleRole(target.attrs["role"]))
      : isToggleRole(target.attrs["role"]);
    if (toggle && !spec?.disabled && target.attrs["aria-disabled"] !== "true") out.activates.set(label, target);
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
function meterLevel(
  value: number,
  min: number,
  max: number,
  low?: number,
  high?: number,
  optimum?: number,
): NonNullable<ControlNode["level"]> {
  const lo = Math.min(Math.max(low ?? min, min), max);
  const hi = Math.min(Math.max(high ?? max, lo), max);
  const opt = Math.min(Math.max(optimum ?? (min + max) / 2, min), max);
  const v = Math.min(Math.max(value, min), max);
  if (opt < lo) return v <= lo ? "optimum" : v <= hi ? "suboptimal" : "poor"; // lower is better
  if (opt > hi) return v >= hi ? "optimum" : v >= lo ? "suboptimal" : "poor"; // higher is better
  return v >= lo && v <= hi ? "optimum" : "suboptimal";
}

/** Controls that paint text of their own (from `value`/`placeholder`) rather than child nodes. */
const SELF_DRAWN_TEXT: Partial<Record<ControlKind, true>> = {
  textField: true,
  secureField: true,
  textEditor: true,
  picker: true,
  datePicker: true,
  stepper: true,
};

/** `<option>` children, including those of an `<optgroup>` (with that group). */
function optionsOf(n: LayoutNode): Array<{ option: LayoutNode; group?: LayoutNode }> {
  const out: Array<{ option: LayoutNode; group?: LayoutNode }> = [];
  for (const c of n.children) {
    if (c.tag === "option") out.push({ option: c });
    else if (c.tag === "optgroup")
      for (const o of c.children) if (o.tag === "option") out.push({ option: o, group: c });
  }
  return out;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
