import { parseColor } from "../css/index.ts";
import type { ControlNode, SemNode } from "../model/semantic.ts";
import { walk } from "../model/semantic.ts";
import type { ControlMembers } from "./context.ts";
import { colorArgs, identifier, num, str, uniqueName } from "./format.ts";
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
      return { type: "Date", value: ".now" };
    case "colorPicker": {
      const c = (n.value ? parseColor(n.value) : undefined) ?? { r: 0, g: 0, b: 0, a: 1 };
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
export function controlMembers(root: SemNode): ControlMembers {
  const stateOf = new Map<SemNode, string>();
  const actionOf = new Map<string, string>();
  const decls: string[] = [];
  const activate = new Map<string, string>();
  const seen: Record<string, number> = {};
  walk(root, (n) => {
    if (n.kind !== "control") return;
    const decl = stateDecl(n);
    if (decl) {
      const name = uniqueName(`s_${identifier(n.id) || "control"}${decl.suffix ?? ""}`, seen);
      stateOf.set(n, name);
      decls.push(`@State private var ${name}: ${decl.type} = ${decl.value}`);
      // What a tap on the control's `<label>` does: a checkbox flips, a radio turns on.
      if (!n.disabled && n.control === "toggle") activate.set(n.id, `${name}.toggle()`);
      else if (!n.disabled && n.control === "radio") activate.set(n.id, `${name} = true`);
    }
    // A handler used by several controls is one callback: the design calls the same function.
    // Two callbacks can still mangle to one name (`#docs` and a link captioned `Docs`), so the
    // property names are deduplicated the same way the state names are.
    if (n.action !== undefined && !actionOf.has(n.action)) {
      const name = uniqueName(`on_${identifier(n.action.replace(/\(.*$/s, "")) || "action"}`, seen);
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
  return { decls, stateOf, actionOf, activate };
}

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
