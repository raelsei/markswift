import { isDeepStrictEqual } from "node:util";
import type { ControlNode, MenuItem, Motion, Presentation, SemNode } from "../model/semantic.ts";
import { walk } from "../model/semantic.ts";
import type { ControlMembers, EmitMode, StatePaint } from "./context.ts";
import { note } from "./diagnostics.ts";
import { colorArgs, identifier, memberName, num, str, uniqueName } from "./format.ts";
import { pairStyle } from "./states.ts";
import { longestExit, revealToggle } from "./motion.ts";
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
 * from the node ids, so regenerating an unchanged design produces the same members. `byId`
 * (breakpoint screens): one element is a node per band alternative; its first node owns the
 * value, toggle, pressed and focused members, every other node of that element reuses them.
 */
export function controlMembers(root: SemNode, mode: EmitMode, byId = false): ControlMembers {
  const firstOf = new Map<string, SemNode>();
  const elementKey = (n: SemNode) => `${n.id}\u0000${n.kind}\u0000${n.kind === "control" ? n.control : ""}`;
  // Ids that name different elements in different bands (script-driven DOM, reported by the merge): their id-keyed
  // paint and label taps would land on the wrong element, so they are dropped.
  // ponytail: the pressed look and label tap of such elements are lost; key them by element if a design needs them.
  const keyOfId = new Map<string, string>();
  const ambiguous = new Set<string>();
  if (byId)
    walk(root, (n) => {
      if (n.id === "" || n.alternatives) return;
      const key = elementKey(n);
      if (!firstOf.has(key)) firstOf.set(key, n);
      if ((keyOfId.get(n.id) ?? key) !== key) ambiguous.add(n.id);
      keyOfId.set(n.id, key);
    });
  const canon = (n: SemNode) => (byId && n.id !== "" && !n.alternatives ? firstOf.get(elementKey(n))! : n);
  const stateOf = new Map<SemNode, string>();
  const actionOf = new Map<string, string>();
  const members: ControlMembers["members"] = [];
  const activate = new Map<string, string>();
  const radioTag = new Map<SemNode, string>();
  const toggleOf: ControlMembers["toggleOf"] = new Map();
  const openOf: ControlMembers["openOf"] = new Map();
  const openStates = new Map<string, string>();
  const closeOf: ControlMembers["closeOf"] = new Map();
  const dismissedOf = new Map<string, string>();
  const menuState = new Map<string, string>();
  const textState = new Map<string, string>();
  // Drawn presentations hang off the root (`analysis/layers.ts`): one shared object per layer id.
  const presentations = new Map<string, Presentation>();
  for (const o of root.overlays) if (o.presentation) presentations.set(o.presentation.id, o.presentation);
  /** Node with `opens` → its shown state: the condition of the open look under it. */
  const opener = new Map<SemNode, string>();
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
  // In-flow layer id → the reveal timing of its content, for the trigger's toggle.
  const reveals = new Map<string, NonNullable<Motion["reveal"]>>();
  walk(root, (n) => {
    if (n.shownBy !== undefined && n.motion?.reveal && !reveals.has(n.shownBy)) reveals.set(n.shownBy, n.motion.reveal);
    if (canon(n) !== n) return;
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
    // A menu trigger has no tap action of its own (a `Menu` opens instead); its items' actions are the screen's.
    const items = n.menu ? flatItems(n.menu.items) : [];
    const actions = [
      n.menu && !n.menu.context ? undefined : n.action,
      ...(n.kind === "text" ? n.runs.map((r) => r.link?.action) : []),
      ...items.map((i) => (i.kind === "button" ? i.action : undefined)),
    ];
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
    // Checkbox items hold a Bool, a radio run (or a select's listbox) the chosen label; a select's value text shows it.
    for (const item of items) {
      if ((item.kind !== "toggle" && item.kind !== "radio") || menuState.has(item.id)) continue;
      const name = uniqueName(`s_${identifier(item.id) || "menu"}`, seen);
      const [type, seed] =
        item.kind === "toggle"
          ? ["Bool", String(item.checked)]
          : ["String", str(n.menu!.select?.value ?? item.options[item.selected]?.label ?? "")];
      menuState.set(item.id, name);
      members.push({ name, kind: "value", type, decl: [`@State private var ${name}: ${type} = ${seed}`] });
      if (n.menu!.select?.valueText !== undefined) textState.set(n.menu!.select.valueText, name);
    }
    const first = canon(n);
    if (first !== n) {
      const state = stateOf.get(first);
      const tag = radioTag.get(first);
      const toggle = toggleOf.get(first);
      const open = openOf.get(first);
      if (state !== undefined) stateOf.set(n, state);
      if (tag !== undefined) radioTag.set(n, tag);
      if (toggle !== undefined) toggleOf.set(n, toggle);
      if (open !== undefined) openOf.set(n, open);
      return;
    }
    // A layer's shown state: the screen owns it, seeded through `init` so a preview can open it. A `<details>` binds
    // its DisclosureGroup to it; any other in-flow trigger flips it on tap, then runs its action. A presentation's tap
    // trigger sets it, then acts; a long-press one keeps its own action (`placementModifiers` adds the gesture).
    if (n.opens) {
      const name = memberName(
        "is",
        n.opens.layer,
        seen,
        "Layer",
        n.opens.kind === "presentation" ? "Presented" : "Expanded",
      );
      const disclosure = n.kind === "control" && n.control === "disclosure";
      const seed = disclosure && n.expanded ? "true" : "false";
      members.push({ name, kind: "open", type: "Bool", seed, decl: [] });
      openStates.set(n.opens.layer, name);
      opener.set(n, name);
      const action = n.action && `${actionOf.get(n.action.key)}()`;
      if (disclosure) stateOf.set(n, name);
      else if (n.opens.kind === "inflow")
        openOf.set(n, { state: name, tap: [revealToggle(name, reveals.get(n.opens.layer)), action!] });
      else if (!n.opens.longPress) openOf.set(n, { state: name, tap: [`${name} = true`, action!] });
      const p = presentations.get(n.opens.layer);
      if (p && (p.dismiss.escape || p.dismiss.outside)) {
        const dismissed = memberName("on", n.opens.layer, seen, "Layer", "Dismissed");
        dismissedOf.set(n.opens.layer, dismissed);
        members.push({
          name: dismissed,
          kind: "action",
          type: "() -> Void",
          decl: [`/// Escape or a tap outside closed ${n.opens.layer}`, `var ${dismissed}: () -> Void = {}`],
        });
      }
      return;
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
  // A presentation's own buttons that close it: the design's action first, then the state goes false.
  for (const o of root.overlays) {
    const state = o.presentation && openStates.get(o.presentation.id);
    if (!state) continue;
    const buttons = new Set(o.presentation!.dismiss.buttons);
    // Inside the layer's longest exit, so the closing transaction carries it.
    const exit = longestExit(root.overlays.filter((x) => x.presentation === o.presentation).map((x) => x.node));
    const close = exit ? `withAnimation(${exit}) { ${state} = false }` : `${state} = false`;
    walk(o.node, (n) => {
      if (n.action && buttons.has(n.id)) closeOf.set(n, [`${actionOf.get(n.action.key)}()`, close]);
    });
  }
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
  const visit = (n: SemNode, owner: SemNode | undefined, openOwner: SemNode | undefined): void => {
    const pressable =
      n.kind === "control"
        ? !n.disabled && (n.control === "button" || (n.control === "link" && !!n.action))
        : !!n.action && !n.action.gesture && !n.a11y?.disabled;
    const own = pressable ? n : owner;
    const opens = n.opens ? n : openOwner;
    const pressed = n.states?.pressed;
    if (pressed && n.id) {
      if (own) {
        let name = pressOf.get(own) ?? pressOf.get(canon(own));
        if (name === undefined) {
          name = memberName("is", own.action?.words ?? own.id, seen, "Control", "Pressed");
          members.push({ name, kind: "ephemeral", type: "Bool", decl: [`@MarkswiftPressed private var ${name}`] });
        }
        pressOf.set(own, name);
        statePaint.set(n.id, pairStyle(n, pressed, name, "pressed"));
      } else note(n, "approximated", ":active", "pressed-state paint outside a button is not reproduced");
    }
    // The open look follows the layer's state; without an owner (fidelity, a skipped layer) it is not drawn.
    const open = n.states?.open;
    const shown = opens && opener.get(opens);
    if (open && n.id && shown) {
      const press = statePaint.get(n.id);
      if (press && isDeepStrictEqual(pressed, open)) press.cond = `(${press.cond} || ${shown})`;
      else {
        if (press) note(n, "approximated", ":active", "pressed look of an open-state trigger is not reproduced");
        statePaint.set(n.id, pairStyle(n, open, shown, "open"));
      }
    }
    const focused = n.states?.focused;
    const field =
      n.kind === "control" &&
      !n.disabled &&
      (n.control === "textField" || n.control === "secureField" || n.control === "textEditor");
    if (focused && n.id && !field)
      note(n, "approximated", ":focus-visible", "focused-state paint outside a text field is not reproduced");
    if (field && n.id && (focused || labelled.has(n.id))) {
      let name = focusOf.get(canon(n));
      if (name === undefined) {
        name = memberName("is", n.a11y?.label ?? n.placeholder ?? n.id, seen, "Field", "Focused");
        members.push({ name, kind: "ephemeral", type: "Bool", decl: [`@MarkswiftFocused private var ${name}`] });
      }
      focusOf.set(n, name);
      if (focused) statePaint.set(n.id, pairStyle(n, focused, name, "focused"));
      if (labelled.has(n.id)) activate.set(n.id, `${name} = true`);
    }
    for (const a of n.alternatives ?? []) visit(a, own, opens);
    for (const o of n.overlays) visit(o.node, own, opens);
    if (n.kind === "stack" || n.kind === "grid") for (const c of n.children) visit(c, own, opens);
    if (n.kind === "control") {
      if (n.label) visit(n.label, own, opens);
      for (const c of n.content) visit(c, own, opens);
    }
  };
  visit(root, undefined, undefined);
  for (const id of ambiguous) {
    statePaint.delete(id);
    activate.delete(id);
  }
  return {
    decls: members.flatMap((m) => m.decl),
    members,
    stateOf,
    actionOf,
    activate,
    radioTag,
    toggleOf,
    openOf,
    openStates,
    closeOf,
    dismissedOf,
    menuState,
    textState,
    statePaint,
    pressOf,
    focusOf,
  };
}

/** A menu's items with its sections opened, in order. */
export const flatItems = (items: MenuItem[]): MenuItem[] =>
  items.flatMap((i) => (i.kind === "section" ? flatItems(i.items) : [i]));

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
