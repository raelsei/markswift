import { parseColor } from "../css/index.ts";
import { colorArgs } from "./format.ts";
import type { ControlNode, SemNode } from "../model/semantic.ts";
import { walk } from "../model/semantic.ts";
import { num, str } from "./format.ts";
export type { ControlMembers } from "./context.ts";
import type { ControlMembers } from "./context.ts";
/**
 * Controls whose value the user changes, and the Swift type and seed of that value. `suffix`
 * names storage that is not the control's value (a file button's presentation flag).
 */
function stateDecl(n: ControlNode): { type: string; value: string; suffix?: string } | undefined {
  if (n.readOnly) return undefined;
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
      if (n.dateKind === "month" || n.dateKind === "week") return undefined;
      return { type: "Date", value: dateSeed(n) };
    case "colorPicker": {
      const c = (n.value ? parseColor(n.value) : undefined) ?? { r: 0, g: 0, b: 0, a: 1 };
      return { type: "Color", value: `.markswift(${colorArgs(c)})` };
    }
    default:
      return undefined;
  }
}

/** Resolve captured wall-clock components in the destination's local zone, not the build zone. */
function dateSeed(n: ControlNode): string {
  const captured = n.dateComponents;
  if (!captured) return ".now";
  // A time input carries no date. The hidden stable Gregorian anchor keeps only its clock meaningful.
  const date = n.dateKind === "time" ? { year: 2001, month: 1, day: 1 } : captured;
  const fields = {
    year: date.year, month: date.month, day: date.day,
    hour: captured.hour ?? 12, minute: captured.minute ?? 0,
    second: captured.second ?? 0, nanosecond: captured.nanosecond ?? 0,
  };
  const components = Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${value}`).join(", ");
  return `Calendar(identifier: .gregorian).date(from: DateComponents(timeZone: .current, ${components})) ?? .now`;
}

/**
 * Every control's state property and every distinct action callback for one screen. Names come
 * from the node ids, so regenerating an unchanged design produces the same members.
 */
export function controlMembers(root: SemNode): ControlMembers {
  const stateOf = new Map<SemNode, string>();
  const actionOf = new Map<string, string>();
  const decls: string[] = [];
  const seen: Record<string, number> = {};
  walk(root, (n) => {
    if (n.kind !== "control") return;
    const decl = stateDecl(n);
    if (decl) {
      const base = `s_${n.id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "control"}${decl.suffix ?? ""}`;
      const k = (seen[base] = (seen[base] ?? 0) + 1);
      const name = k === 1 ? base : `${base}_r${k}`;
      stateOf.set(n, name);
      decls.push(`@State private var ${name}: ${decl.type} = ${decl.value}`);
    }
    // A handler used by several controls is one callback: the design calls the same function.
    // Two callbacks can still mangle to one name (`#docs` and a link captioned `Docs`), so the
    // property names are deduplicated the same way the state names are.
    if (n.action !== undefined && !actionOf.has(n.action)) {
      const base = `on_${n.action.replace(/\(.*$/s, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "action"}`;
      const k = (seen[base] = (seen[base] ?? 0) + 1);
      const name = k === 1 ? base : `${base}_r${k}`;
      actionOf.set(n.action, name);
      // A destination-less `<a>` carries `#<target>` rather than a handler's source: the design
      // named a place, and the developer supplies the navigation that goes there.
      const target = n.control === "link" && n.action.startsWith("#") ? n.action.slice(1) : undefined;
      decls.push(
        target !== undefined
          ? `/// \`<a href="${oneLine(n.href ?? "")}">\` → \`${oneLine(target)}\` in the design: in-page navigation; fill in the destination.`
          : `/// \`onclick="${oneLine(n.action)}"\` in the design.`,
      );
      decls.push(`var ${name}: () -> Void = {}`);
    }
  });
  return { decls, stateOf, actionOf };
}

/** The SwiftUI control itself; the caller appends the node's box modifiers. */

/** The control's value as a number, clamped into its range (the range's start when it has none). */
export function numericValue(n: ControlNode): number {
  const r = n.range ?? { min: 0, max: 100 };
  const v = Number(n.value ?? "");
  return Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : r.min;
}

/** A design string on one line, for the doc comments that quote the design's own markup. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
