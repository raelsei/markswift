import type { ControlNode, SemNode } from "../model/semantic.ts";
import { walk } from "../model/semantic.ts";
import type { ControlMembers, EmitMode, StatePaint } from "./context.ts";
import { note } from "./diagnostics.ts";
import { colorArgs, identifier, memberName, num, str, uniqueName } from "./format.ts";
import { pairStyle } from "./states.ts";
/**
 * Controls whose value the user changes, and the Swift type and seed of that value. `suffix`
 * names storage that is not the control's value (a file button's presentation flag).
 */
function stateDecl(n: ControlNode): { type: string; value: string; suffix?: string } | undefined {
  // A file button holds no value: the only thing it owns is the flag its `.fileImporter` binds to.
  if (n.files) return { type: "Bool", value: "false", suffix: "_presented" };
  switch (n.control) {
    case "textField":
    case "secureField":
    case "textEditor":
    case "picker":
      return { type: "String", value: str(n.value ?? "") };
    case "toggle":
    case "radio":
      return { type: "Bool", value: n.checked ? "true" : "false" };
    case "disclosure":
      return { type: "Bool", value: n.expanded ? "true" : "false" };
    case "slider":
    case "stepper":
      return { type: "Double", value: num(numericValue(n)) };
    case "datePicker":
      return { type: "Date", value: dateSeed(n.value) };
    case "colorPicker": {
      const c = n.swatch ?? { r: 0, g: 0, b: 0, a: 1 };
      return { type: "Color", value: `.markswift(${colorArgs(c)})` };
    }
    default:
      return undefined;
  }
}

/**
 * Every control's state property and every distinct action callback for one screen. Names come
 * from the node ids, so regenerating an unchanged design produces the same members.
 */
export function controlMembers(root: SemNode, mode: EmitMode): ControlMembers {
  const stateOf = new Map<SemNode, string>();
  const actionOf = new Map<string, string>();
  const members: ControlMembers["members"] = [];
  const activate = new Map<string, string>();
  const radioTag = new Map<SemNode, string>();
  const toggleOf: ControlMembers["toggleOf"] = new Map();
  const seen: Record<string, number> = {};
  // Radios sharing a form owner and a `name` hold one `String` selection, named after the `name`:
  // each radio's tag is its `value` when the group's values are unique, else its position. HTML:
  // the last `checked` radio wins.
  const groups = new Map<string, ControlNode[]>();
  // ARIA toggle roles on an element emitted as a Button or tap gesture (a native checkbox owns its
  // value), and the radios of each `role=radiogroup`, tagged by position (a `<button>`'s `value` is
  // not in the IR).
  const ariaToggles = new Set<SemNode>();
  const ariaGroups = new Map<string, SemNode[]>();
  walk(root, (n) => {
    if (n.a11y?.toggle && n.action && (n.kind !== "control" || (n.control === "button" && !n.files))) {
      ariaToggles.add(n);
      const g = n.a11y.group;
      if (g !== undefined) ariaGroups.set(g, [...(ariaGroups.get(g) ?? []), n]);
    }
    if (n.kind !== "control" || n.control !== "radio" || n.group === undefined) return;
    const key = JSON.stringify([n.form ?? null, n.group]);
    const list = groups.get(key);
    if (list) list.push(n);
    else groups.set(key, [n]);
  });
  const groupState = new Map<string, string>();
  const ariaGroupState = new Map<string, string>();
  walk(root, (n) => {
    // A handler used by several elements is one callback: the design calls the same function, or
    // links to the same place. Different keys that name alike are deduplicated `onEdit`, `onEdit2`.
    const actions = [n.action, ...(n.kind === "text" ? n.runs.map((r) => r.link?.action) : [])];
    for (const a of actions) {
      if (!a || actionOf.has(a.key)) continue;
      const name = memberName("on", a.words, seen, "Action");
      actionOf.set(a.key, name);
      members.push({
        name,
        kind: "action",
        type: "() -> Void",
        decl: [`/// ${a.origin}`, `var ${name}: () -> Void = {}`],
      });
    }
    const ax = n.a11y;
    if (ax && ariaToggles.has(n)) {
      // An ARIA toggle drawn as a Button: the screen owns the state the design shows. A tap changes
      // it — a radio selects itself in its radiogroup — and then runs the element's action.
      // ponytail: a radio outside a radiogroup (`menuitemradio` too) flips like a checkbox; group them if a design needs it.
      const action = `${actionOf.get(n.action!.key)}()`;
      const group = ax.group !== undefined ? ariaGroups.get(ax.group) : undefined;
      let toggle: { tap: string[]; on: string; mixed?: string };
      if (ax.group !== undefined && group) {
        let name = ariaGroupState.get(ax.group);
        if (name === undefined) {
          name = uniqueName(`s_${identifier(ax.group) || "group"}`, seen);
          ariaGroupState.set(ax.group, name);
          const checked = group.findLastIndex((r) => r.a11y?.selected);
          members.push({
            name,
            kind: "value",
            type: "String",
            decl: [`@State private var ${name}: String = ${str(checked >= 0 ? String(checked) : "")}`],
          });
        }
        const tag = str(String(group.indexOf(n)));
        stateOf.set(n, name);
        toggle = { tap: [`${name} = ${tag}`, action], on: `${name} == ${tag}` };
      } else {
        const name = uniqueName(`s_${identifier(n.id) || "toggle"}`, seen);
        const mixed = ax.value === "mixed";
        const type = mixed ? "Bool?" : "Bool";
        stateOf.set(n, name);
        members.push({
          name,
          kind: "value",
          type,
          decl: [`@State private var ${name}: ${type} = ${mixed ? "nil" : ax.selected ? "true" : "false"}`],
        });
        toggle = mixed
          ? { tap: [`${name} = !(${name} ?? false)`, action], on: `${name} == true`, mixed: `${name} == nil` }
          : { tap: [`${name}.toggle()`, action], on: name };
      }
      toggleOf.set(n, toggle);
      if (!ax.disabled && !(n.kind === "control" && n.disabled)) activate.set(n.id, toggle.tap.join("; "));
      return;
    }
    if (n.kind !== "control") return;
    const key = n.control === "radio" && n.group !== undefined ? JSON.stringify([n.form ?? null, n.group]) : undefined;
    const group = key !== undefined ? groups.get(key) : undefined;
    if (key !== undefined && group) {
      const values = group.map((r) => r.value ?? "on");
      const tags = new Set(values).size === values.length ? values : group.map((_, i) => String(i));
      let name = groupState.get(key);
      if (name === undefined) {
        name = uniqueName(`s_${identifier(n.group!) || "group"}`, seen);
        groupState.set(key, name);
        const checked = group.findLastIndex((r) => r.checked);
        members.push({
          name,
          kind: "value",
          type: "String",
          decl: [`@State private var ${name}: String = ${str(checked >= 0 ? tags[checked]! : "")}`],
        });
      }
      const tag = tags[group.indexOf(n)]!;
      stateOf.set(n, name);
      radioTag.set(n, tag);
      if (!n.disabled) activate.set(n.id, `${name} = ${str(tag)}`);
      return;
    }
    const decl = stateDecl(n);
    if (decl) {
      const name = uniqueName(`s_${identifier(n.id) || "control"}${decl.suffix ?? ""}`, seen);
      stateOf.set(n, name);
      members.push({
        name,
        kind: "value",
        type: decl.type,
        decl: [`@State private var ${name}: ${decl.type} = ${decl.value}`],
      });
      // What a tap on the control's `<label>` does: a checkbox flips, a lone radio turns on.
      if (!n.disabled && n.control === "toggle") activate.set(n.id, `${name}.toggle()`);
      else if (!n.disabled && n.control === "radio") activate.set(n.id, `${name} = true`);
    }
  });
  // Pressed/focused looks: a delta belongs to the nearest enclosing Button (its press drives the
  // whole label) or to the text field itself; everything else is reported. App mode: a text field
  // some `<label>` names takes focus when the label is tapped, so it owns a focus member too.
  const labelled = new Set<string>();
  if (mode === "app")
    walk(root, (n) => {
      if (n.labelFor !== undefined) labelled.add(n.labelFor);
    });
  const statePaint = new Map<string, StatePaint>();
  const pressOf = new Map<SemNode, string>();
  const focusOf = new Map<SemNode, string>();
  const visit = (n: SemNode, owner: SemNode | undefined): void => {
    const pressable =
      n.kind === "control"
        ? !n.disabled && (n.control === "button" || (n.control === "link" && !!n.action))
        : !!n.action && !n.action.gesture && !n.a11y?.disabled;
    const own = pressable ? n : owner;
    const pressed = n.states?.pressed;
    if (pressed && n.id) {
      if (own) {
        let name = pressOf.get(own);
        if (name === undefined) {
          name = memberName("is", own.action?.words ?? own.id, seen, "Control", "Pressed");
          members.push({ name, kind: "ephemeral", type: "Bool", decl: [`@MarkswiftPressed private var ${name}`] });
          pressOf.set(own, name);
        }
        statePaint.set(n.id, pairStyle(n, pressed, name));
      } else note(n, "approximated", ":active", "pressed-state paint outside a button is not reproduced");
    }
    const focused = n.states?.focused;
    const field =
      n.kind === "control" &&
      !n.disabled &&
      (n.control === "textField" || n.control === "secureField" || n.control === "textEditor");
    if (focused && n.id && !field)
      note(n, "approximated", ":focus-visible", "focused-state paint outside a text field is not reproduced");
    if (field && n.id && (focused || labelled.has(n.id))) {
      const name = memberName("is", n.a11y?.label ?? n.placeholder ?? n.id, seen, "Field", "Focused");
      members.push({ name, kind: "ephemeral", type: "Bool", decl: [`@MarkswiftFocused private var ${name}`] });
      focusOf.set(n, name);
      if (focused) statePaint.set(n.id, pairStyle(n, focused, name));
      if (labelled.has(n.id)) activate.set(n.id, `${name} = true`);
    }
    for (const a of n.alternatives ?? []) visit(a, own);
    for (const o of n.overlays) visit(o.node, own);
    if (n.kind === "stack" || n.kind === "grid") for (const c of n.children) visit(c, own);
    if (n.kind === "control") {
      if (n.label) visit(n.label, own);
      for (const c of n.content) visit(c, own);
    }
  };
  visit(root, undefined);
  return {
    decls: members.flatMap((m) => m.decl),
    members,
    stateOf,
    actionOf,
    activate,
    radioTag,
    toggleOf,
    statePaint,
    pressOf,
    focusOf,
  };
}

/** The control's value as a number, clamped into its range (the range's start when it has none). */
export function numericValue(n: ControlNode): number {
  const r = n.range ?? { min: 0, max: 100 };
  const v = Number(n.value ?? "");
  return Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : r.min;
}

/**
 * An `<input type=date|time|datetime-local|month|week>` value as the wall-clock date the design
 * wrote (`Date.markswift`, runtime/controls.swift). HTML sanitises an invalid value to empty, and
 * an empty field has no date to show, so both start at `.now`.
 */
export function dateSeed(value: string | undefined): string {
  const v = (value ?? "").trim();
  let m: RegExpMatchArray | null;
  let y = 2000,
    mo = 1,
    d = 1,
    h = 0,
    mi = 0,
    s = 0;
  if ((m = v.match(/^(\d{4,})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/))) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4] !== undefined) [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  } else if ((m = v.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/))) {
    [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  } else if ((m = v.match(/^(\d{4,})-(\d{2})$/))) {
    [y, mo] = [Number(m[1]), Number(m[2])];
  } else if ((m = v.match(/^(\d{4,})-W(\d{2})$/))) {
    // ISO week: week 1 holds January 4th; weeks start on Monday.
    const jan4 = Date.UTC(Number(m[1]), 0, 4);
    const monday = new Date(
      jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000 + (Number(m[2]) - 1) * 7 * 86_400_000,
    );
    [y, mo, d] = [monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()];
  } else return ".now";
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return ".now";
  return `.markswift(year: ${y}, month: ${mo}, day: ${d}, hour: ${h}, minute: ${mi}, second: ${s})`;
}
