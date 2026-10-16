/**
 * App mode: closed in-flow layers (`<details>`, collapsibles, accordion items) become content behind the screen's state;
 * dialogs, sheets, popovers and hover cards become drawn presentations (plan 060, D-PRESENT); menus and listboxes
 * become the trigger's native `Menu` (plan 061, D-MENUS).
 */
import { type Layer, type LayoutDoc, type LayoutNode } from "../model/layout.ts";
import {
  type MenuItem,
  type PickerOption,
  type Presentation,
  type Screen,
  type SemNode,
  addDiagnostic,
  confidenceOf,
  walk,
} from "../model/semantic.ts";
import { parseColor, round2 } from "../css/index.ts";
import { type InferOptions } from "./context.ts";
import { elementAction } from "./controls.ts";
import { buildDetached, layerOverlays } from "./infer.ts";
import { isTooltipLayer } from "./tooltips.ts";

const REASON = {
  container: "its container is a measured, wrapping, flex or grid layout",
  stack: "its container is not a stack",
  trigger: "the trigger is not a button",
  sibling: "no stable sibling to insert after",
} as const;

/**
 * Each `inflow` layer of `doc`: a `<details>` gets the content and `opens`; anything else inserts the content into its
 * plain parent stack after its rest predecessor (`shownBy`), and the trigger Button `opens` it. A menu or listbox layer
 * becomes its trigger's native menu (`menu`); each other layer that is not a tooltip (062) becomes a drawn presentation
 * on the root (`present`). Skips are reported.
 */
// ponytail: content goes into plain stacks only; measured/flex/grid parents report and keep today's output.
export function applyLayers(screen: Screen, doc: LayoutDoc, options: InferOptions = {}): void {
  if (!doc.layers?.length) return;
  const menus = new Set(doc.layers.filter((l) => l.relation !== "details" && menuOf(l)));
  const layers = doc.layers.filter((l) => l.placement === "inflow" && !menus.has(l));
  const rest = new Map<string, LayoutNode>();
  const index = (n: LayoutNode) => {
    if (n.id !== undefined) rest.set(n.id, n);
    n.children.forEach(index);
  };
  index(doc.root);
  const sem = new Map<string, SemNode>();
  walk(screen.root, (n) => {
    if (n.id && !sem.has(n.id)) sem.set(n.id, n);
  });
  for (const layer of layers) {
    const feature = layer.relation === "details" ? "details" : "@aria-*";
    const parentLayout = layer.parent !== undefined ? rest.get(layer.parent) : undefined;
    const parent = layer.parent !== undefined ? sem.get(layer.parent) : undefined;
    const trigger = sem.get(layer.trigger);
    const report = (at: SemNode | undefined, message: string) => {
      const n = at ?? screen.root;
      addDiagnostic(n.diagnostics, "approximated", feature, message);
      n.confidence = confidenceOf(n.diagnostics);
    };
    const skip = (reason: string) =>
      report(parent ?? trigger, `content shown by ${layer.id} is not emitted: ${reason}`);
    const content = (nodes: LayoutNode[]) => {
      const built = nodes.map((node) => buildDetached(node, parentLayout!, doc, options));
      if (built.some((b) => b.fixed))
        report(parent, `a position: fixed descendant of the content shown by ${layer.id} is not emitted`);
      return built.map((b) => b.sem);
    };
    if (!parentLayout || !parent) {
      skip(REASON.sibling);
      continue;
    }
    if (layer.relation === "details") {
      if (parent.kind !== "control" || parent.control !== "disclosure") {
        skip(REASON.trigger);
        continue;
      }
      // Chrome lays out a closed `<details>`' content (it paints none): rest already captured it.
      const have = new Set(parent.content.map((c) => c.id));
      parent.content.push(...content(layer.nodes.filter((n) => n.id === undefined || !have.has(n.id))));
      parent.opens = { layer: layer.id, kind: "inflow" };
      continue;
    }
    if (!trigger?.action) {
      skip(REASON.trigger);
      continue;
    }
    if (parent.kind !== "stack" && parent.kind !== "grid") {
      skip(REASON.stack);
      continue;
    }
    if (parent.kind === "grid" || parent.measured || parent.wrap || parent.flex) {
      skip(REASON.container);
      continue;
    }
    const k = layer.index ?? -1;
    const predId = k > 0 ? parentLayout.children[k - 1]?.id : undefined;
    const p = predId !== undefined ? parent.children.findIndex((c) => c.id === predId) + 1 : 0;
    // k = 0: the content becomes the first child, so it must not take an edge the old first child had.
    const first =
      k === 0 &&
      typeof parent.spacing === "number" &&
      parent.leadInset === 0 &&
      !parent.autoGaps?.length &&
      parent.distribution !== "between";
    if (k < 0 || (k > 0 && p === 0) || (k === 0 && !first)) {
      skip(REASON.sibling);
      continue;
    }
    const nodes = content(layer.nodes);
    for (const n of nodes) n.shownBy = layer.id;
    // One gap per inserted node from the measured open geometry; the old pred → next gap stays after the last one.
    const v = parent.axis === "v";
    const gaps =
      p > 0
        ? nodes.map((n, i) => {
            const prev = i ? nodes[i - 1]! : parent.children[p - 1]!;
            return round2(v ? n.frame.y - prev.frame.y - prev.frame.h : n.frame.x - prev.frame.x - prev.frame.w);
          })
        : [];
    if (typeof parent.spacing === "number") {
      const s = parent.spacing;
      if (gaps.some((g) => Math.abs(g - s) > 0.5))
        parent.spacing = Array.from({ length: Math.max(0, parent.children.length - 1) }, () => s);
    }
    if (Array.isArray(parent.spacing)) parent.spacing.splice(p - 1, 0, ...gaps);
    if (parent.autoGaps) parent.autoGaps = parent.autoGaps.map((g) => (g >= p ? g + nodes.length : g));
    parent.children.splice(p, 0, ...nodes);
    trigger.opens = { layer: layer.id, kind: "inflow" };
  }
  for (const layer of doc.layers)
    if (menus.has(layer)) menu(screen, layer, rest, sem);
    else if (
      layer.placement !== "inflow" &&
      !isTooltipLayer(layer, doc.root) &&
      // A menubar alone, or a menu `<details>` shows, is no drawn popup.
      !layer.nodes.some((n) => find(n, (d) => !!MENU_ROLES[d.attrs["role"] ?? ""]))
    )
      present(screen, doc, layer, rest, sem, options);
}

const MENU_ROLES: Record<string, true> = { menu: true, menubar: true, listbox: true };

/** The `role=menu|listbox` element of a layer: what a native menu lists. */
const menuOf = (layer: Layer): LayoutNode | undefined =>
  layer.nodes.reduce<LayoutNode | undefined>(
    (hit, n) => hit ?? find(n, (d) => d.attrs["role"] === "menu" || d.attrs["role"] === "listbox"),
    undefined,
  );

/** An item's text without its `[data-slot$=shortcut]` hint, whitespace collapsed. */
const itemText = (n: LayoutNode): string => {
  const of = (d: LayoutNode): string =>
    d.tag === "#text"
      ? (d.text ?? "")
      : (d.attrs["data-slot"] ?? "").endsWith("shortcut")
        ? ""
        : d.children.map(of).join("");
  return of(n).replace(/\s+/g, " ").trim();
};
const disabled = (n: LayoutNode) => n.attrs["aria-disabled"] === "true" || n.attrs["data-disabled"] !== undefined;
/** Radix marks the current item `data-state=checked` (a select option's `aria-selected` follows focus). */
const checked = (n: LayoutNode, aria: string) => n.attrs[aria] === "true" || n.attrs["data-state"] === "checked";

/**
 * A menu or listbox layer as its trigger's native popup (D-MENUS): the items in DOM order — a listbox is one inline
 * Picker of its options — under a `Menu` on the trigger, or `.contextMenu` for a right-click layer. The trigger keeps
 * its CSS look; the open list is not drawn and has no `@open` capture.
 */
function menu(screen: Screen, layer: Layer, rest: Map<string, LayoutNode>, sem: Map<string, SemNode>): void {
  const trigger = sem.get(layer.trigger);
  const report = (n: SemNode, message: string) => {
    addDiagnostic(n.diagnostics, "approximated", "@role", message);
    n.confidence = confidenceOf(n.diagnostics);
  };
  const context = layer.activation === "contextmenu";
  const button =
    trigger &&
    (trigger.kind === "control"
      ? trigger.control === "button" && !trigger.files
      : !!trigger.action && !trigger.action.gesture);
  if (!trigger || (!context && !button)) {
    const why = trigger ? "the trigger is not a button" : "its trigger is not in the screen";
    report(trigger ?? screen.root, `menu ${layer.id} is not translated: ${why}`);
    return;
  }
  const list = menuOf(layer)!;
  // `aria-labelledby` targets: a group's heading.
  const byDomId = new Map<string, LayoutNode>();
  const index = (d: LayoutNode): void => {
    if (d.attrs["id"]) byDomId.set(d.attrs["id"], d);
    d.children.forEach(index);
  };
  layer.nodes.forEach(index);
  const items: MenuItem[] = [];
  const notes = new Set<string>();
  if (list.attrs["role"] === "listbox") {
    const options: PickerOption[] = [];
    let selected = -1;
    const collect = (n: LayoutNode, group: string | undefined): void => {
      if (n.attrs["role"] === "option") {
        const o: PickerOption = { label: itemText(n) };
        if (disabled(n)) o.disabled = true;
        if (group) o.group = group;
        if (checked(n, "aria-selected")) selected = options.length;
        options.push(o);
        return;
      }
      const label =
        n.attrs["role"] === "group"
          ? (byDomId.get(n.attrs["aria-labelledby"] ?? "") ??
            find(n, (d) => (d.attrs["data-slot"] ?? "").endsWith("-label")))
          : undefined;
      for (const c of n.children) collect(c, label ? itemText(label) || undefined : group);
    };
    collect(list, undefined);
    items.push({ kind: "radio", id: list.id!, options, selected });
  } else {
    // Items go into the open section (a label heads one until the next separator or label), else the top level; a run
    // of `menuitemradio` (one group, or consecutive) is one Picker.
    let into = items;
    let radio: Extract<MenuItem, { kind: "radio" }> | undefined;
    const push = (item: MenuItem) => {
      into.push(item);
      radio = undefined;
    };
    const open = (label: string) => {
      const section: MenuItem = { kind: "section", label, items: [] };
      items.push(section);
      into = section.items;
      radio = undefined;
    };
    const visit = (n: LayoutNode): void => {
      const role = n.attrs["role"] ?? "";
      const label = role.startsWith("menuitem") ? itemText(n) : "";
      if (role.startsWith("menuitem")) {
        if (find(n, (d) => (d.attrs["data-slot"] ?? "").endsWith("shortcut")))
          notes.add("menu shortcut text is dropped");
        if (find(n, (d) => d.tag === "svg" || d.tag === "img")) notes.add("menu item icons are dropped");
      }
      const off = disabled(n) ? { disabled: true as const } : {};
      if (role === "separator") {
        into = items;
        push({ kind: "divider" });
      } else if ((n.attrs["data-slot"] ?? "").endsWith("-label")) open(itemText(n));
      else if (role === "menuitem" && (n.attrs["aria-haspopup"] ?? "false") !== "false") {
        push({ kind: "submenu", id: n.id!, label });
        notes.add(`submenu ${label} items are not captured`);
      } else if (role === "menuitem")
        push({
          kind: "button",
          id: n.id!,
          label,
          action: elementAction(n, label),
          ...off,
          ...(n.attrs["data-variant"] === "destructive" ? { destructive: true as const } : {}),
        });
      else if (role === "menuitemcheckbox")
        push({ kind: "toggle", id: n.id!, label, checked: checked(n, "aria-checked"), ...off });
      else if (role === "menuitemradio") {
        if (!radio) {
          radio = { kind: "radio", id: n.id!, options: [], selected: -1 };
          into.push(radio);
        }
        if (checked(n, "aria-checked")) radio.selected = radio.options.length;
        radio.options.push({ label, ...off });
      } else {
        const heading = role === "group" ? byDomId.get(n.attrs["aria-labelledby"] ?? "") : undefined;
        if (heading && !(heading.attrs["data-slot"] ?? "").endsWith("-label")) open(itemText(heading));
        if (role === "group") radio = undefined;
        n.children.forEach(visit);
        if (role === "group") radio = undefined;
      }
    };
    list.children.forEach(visit);
  }
  trigger.menu = { layer: layer.id, ...(context ? { context: true as const } : {}), items };
  if (list.attrs["role"] === "listbox") {
    const at = rest.get(layer.trigger);
    const shown = at && find(at, (d) => d.attrs["data-slot"] === "select-value");
    const radio = items[0] as Extract<MenuItem, { kind: "radio" }>;
    const value = radio.options[radio.selected]?.label ?? (at ? itemText(shown ?? at) : "");
    let valueText: string | undefined;
    const target = shown && itemText(shown);
    if (target)
      walk(trigger, (n) => {
        if (valueText === undefined && n.kind === "text" && n.runs.length === 1 && n.runs[0]!.text.trim() === target)
          valueText = n.id;
      });
    if (valueText === undefined) notes.add("the select's value text does not follow the choice");
    trigger.menu.select = { value, ...(valueText !== undefined ? { valueText } : {}) };
  }
  report(trigger, "native menu popup: the CSS look of the open list is not drawn");
  for (const note of notes) report(trigger, note);
}

const find = (n: LayoutNode, test: (n: LayoutNode) => boolean): LayoutNode | undefined =>
  test(n) ? n : n.children.reduce<LayoutNode | undefined>((hit, c) => hit ?? find(c, test), undefined);

const near = (a: number, b: number) => Math.abs(a - b) <= 1;

/** A unit point along one axis for a CSS-ish side/alignment keyword. */
const UNIT: Record<string, number> = { start: 0, center: 0.5, end: 1 };

/**
 * One viewport/anchored layer as a drawn presentation: its roots join `screen.root.overlays` (fixed, sharing one
 * `Presentation`), placed by classifying the first content root, and the trigger `opens` it.
 */
function present(
  screen: Screen,
  doc: LayoutDoc,
  layer: Layer,
  rest: Map<string, LayoutNode>,
  sem: Map<string, SemNode>,
  options: InferOptions,
): void {
  const alert = layer.nodes.some((n) => find(n, (d) => d.attrs["role"] === "alertdialog"));
  const dialog = alert || layer.nodes.some((n) => find(n, (d) => d.tag === "dialog" || d.attrs["role"] === "dialog"));
  const feature = dialog && layer.placement !== "anchored" ? "dialog" : "@popover";
  const trigger = sem.get(layer.trigger);
  const longPress = layer.activation !== "click";
  const skip = (reason: string) => {
    const n = trigger ?? screen.root;
    addDiagnostic(n.diagnostics, "approximated", feature, `${layer.id} is not presented: ${reason}`);
    n.confidence = confidenceOf(n.diagnostics);
  };
  if (!trigger) {
    skip("its trigger is not in the screen");
    return;
  }
  if (!longPress && !trigger.action) {
    skip("the trigger is not a button");
    return;
  }
  const overlays = layerOverlays(doc, layer.nodes, options);
  const byId = new Map<string, LayoutNode>();
  const index = (n: LayoutNode) => {
    if (n.id !== undefined && !byId.has(n.id)) byId.set(n.id, n);
    n.children.forEach(index);
  };
  layer.nodes.forEach(index);
  const vp = doc.viewport;
  const content = overlays.filter(
    ({ covers, node: { frame: r } }) =>
      !covers && !(near(r.x, vp.x) && near(r.y, vp.y) && near(r.w, vp.w) && near(r.h, vp.h)),
  );
  const first = content[0];
  const c = first && byId.get(first.node.id);
  if (!first || !c) {
    skip("every root covers the screen");
    return;
  }
  // The pure translation the content paints at (Radix centring, Floating UI placement); 0 for anything else.
  const t = first.node.style.transform;
  const pure =
    t && t.rotate === 0 && t.scaleX === 1 && t.scaleY === 1 && t.skewX === undefined && t.skewY === undefined;
  const [tx, ty] = pure ? [t.tx, t.ty] : [0, 0];
  const b = c.bounds;
  const painted = { x: b.x + tx, y: b.y + ty, w: b.w, h: b.h };
  const insets = c.preferredSize?.insets;
  const topLayer = c.styles["overlay"] === "auto";
  let placement: Presentation["placement"] = { kind: "offset" };
  const sides = insets ? (["top", "right", "bottom", "left"] as const).filter((s) => insets[s] !== "0px") : [];
  if (
    (insets?.top === "50%" && insets.left === "50%" && near(tx, -b.w / 2) && near(ty, -b.h / 2)) ||
    (topLayer &&
      (c.tag === "dialog" || c.attrs["popover"] !== undefined) &&
      (c.preferredSize?.autoMargins?.length ?? 0) === 4) ||
    (near(painted.x + painted.w / 2, vp.x + vp.w / 2) && near(painted.y + painted.h / 2, vp.y + vp.h / 2))
  ) {
    placement = { kind: "center" };
  } else if (sides.length === 1) {
    const EDGE = { left: "trailing", top: "bottom", right: "leading", bottom: "top" } as const;
    placement = { kind: "edge", edge: EDGE[sides[0]!] };
  } else if (layer.placement === "anchored" && rest.has(layer.trigger)) {
    const r = rest.get(layer.trigger)!.bounds;
    const sideAttr = find(c, (d) => d.attrs["data-side"] !== undefined)?.attrs["data-side"];
    const alignAttr = find(c, (d) => d.attrs["data-align"] !== undefined)?.attrs["data-align"];
    const side =
      sideAttr === "top" || sideAttr === "bottom" || sideAttr === "left" || sideAttr === "right"
        ? sideAttr
        : painted.y >= r.y + r.h - 1
          ? "bottom"
          : painted.y + painted.h <= r.y + 1
            ? "top"
            : painted.x >= r.x + r.w - 1
              ? "right"
              : painted.x + painted.w <= r.x + 1
                ? "left"
                : undefined;
    if (side) {
      const v = side === "top" || side === "bottom";
      // Cross axis: the content's start/centre/end against the trigger's.
      const [p0, pw, r0, rw] = v ? [painted.x, painted.w, r.x, r.w] : [painted.y, painted.h, r.y, r.h];
      const align =
        alignAttr !== undefined && UNIT[alignAttr] !== undefined
          ? alignAttr
          : near(p0, r0)
            ? "start"
            : near(p0 + pw / 2, r0 + rw / 2)
              ? "center"
              : near(p0 + pw, r0 + rw)
                ? "end"
                : "start";
      const a = UNIT[align]!;
      const main = side === "bottom" || side === "right" ? [1, 0] : [0, 1];
      const from: [number, number] = v ? [a, main[0]!] : [main[0]!, a];
      const to: [number, number] = v ? [a, main[1]!] : [main[1]!, a];
      const gap: [number, number] = [
        round2(painted.x + painted.w * to[0] - (r.x + r.w * from[0])),
        round2(painted.y + painted.h * to[1] - (r.y + r.h * from[1])),
      ];
      placement = { kind: "anchored", from, to, gap };
    }
  }
  // Centred and anchored content is placed by the runtime: the translation that placed it in CSS goes.
  if (pure && (placement.kind === "center" || placement.kind === "anchored")) delete first.node.style.transform;
  const backdrop = overlays
    .map((o) => byId.get(o.node.id))
    .filter((n) => n?.styles["overlay"] === "auto")
    .map((n) => parseColor(n!.pseudoStyles?.backdrop?.["background-color"]))
    .find((col) => col && col.a > 0);
  const inside = new Map<string, SemNode>();
  for (const o of overlays) walk(o.node, (n) => inside.set(n.id, n));
  const presentation: Presentation = {
    id: layer.id,
    trigger: trigger.id,
    style: alert
      ? "alertdialog"
      : feature === "dialog"
        ? placement.kind === "edge"
          ? "sheet"
          : "dialog"
        : layer.activation === "hover"
          ? "hovercard"
          : "popover",
    placement,
    ...(backdrop ? { backdrop } : {}),
    modal: layer.modal,
    dismiss: {
      escape: layer.dismiss.escape,
      outside: layer.dismiss.outside && !alert,
      buttons: layer.dismiss.buttons.filter((id) => !!inside.get(id)?.action),
    },
  };
  for (const o of overlays) {
    o.presentation = presentation;
    // A scrim draws but lets taps through to the presentation's own outside-tap layer.
    if (!content.includes(o)) o.node.hitTesting = false;
  }
  screen.root.overlays.push(...overlays);
  trigger.opens = {
    layer: layer.id,
    kind: "presentation",
    ...(longPress ? { longPress: true as const } : {}),
    ...(placement.kind === "anchored" ? { anchor: true as const } : {}),
  };
  addDiagnostic(
    first.node.diagnostics,
    "approximated",
    feature,
    "drawn inside the component's frame: no swipe-to-dismiss, no collision flip; captured at the primary viewport",
  );
  first.node.confidence = confidenceOf(first.node.diagnostics);
}
