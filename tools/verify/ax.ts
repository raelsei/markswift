/**
 * Accessibility parity: the named nodes Chrome exposes in its accessibility tree, and whether the converted
 * IR keeps a counterpart (role + name) for each. Shared by the static gate (`ax-parity.test.ts`) and the
 * iOS behaviour harness (`ios-behaviour.ts`).
 */
import type { Page } from "playwright-core";
import { walk, type Screen, type SemNode } from "../../src/model/semantic.ts";

export interface AxNamed {
  role: string;
  /** Normalised. */
  name: string;
}

export const normalizeName = (s: string) =>
  s
    .replace(/[\u00ad\u200b]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isControl = (n: SemNode, ...kinds: string[]) => n.kind === "control" && kinds.includes(n.control);
const button = (n: SemNode) => isControl(n, "button") || !!n.action || n.a11y?.trait === "isButton";
const toggle = (n: SemNode) => isControl(n, "toggle", "radio") || !!n.a11y?.toggle;
const range = (n: SemNode) => isControl(n, "slider", "progress", "gauge") || n.a11y?.value !== undefined;
const image = (n: SemNode) => n.kind === "image" || n.kind === "svg" || n.a11y?.trait === "isImage";
const field = (n: SemNode) => isControl(n, "textField", "secureField", "textEditor");

/** Chrome role → whether an IR node can stand for it. `StaticText` is matched against the whole screen's text. */
export const CHECKED_ROLES: Record<string, (n: SemNode) => boolean> = {
  button,
  tab: button,
  menuitem: button,
  /** A `<select>`'s options are exposed under its combobox; the picker offers each one's name. */
  option: (n) => button(n) || isControl(n, "picker"),
  link: (n) => isControl(n, "link") || n.a11y?.trait === "isLink" || (n.kind === "text" && n.runs.some((r) => r.link)),
  heading: (n) => n.a11y?.heading !== undefined,
  image,
  img: image,
  checkbox: toggle,
  switch: toggle,
  radio: toggle,
  textbox: field,
  searchbox: field,
  /** A `<select>`, a date input, or a `<button role=combobox>` (a Radix select: its listbox layer makes it a `Menu`, 061). */
  combobox: (n) => isControl(n, "picker", "datePicker", "button"),
  slider: range,
  progressbar: range,
  meter: range,
  columnheader: (n) => n.a11y?.trait === "isHeader",
  rowheader: (n) => n.a11y?.trait === "isHeader",
  /** Matched against the screen's text in DOM order (`axParity`), like `StaticText`. */
  cell: () => false,
  StaticText: () => false,
};

/** Table cell roles: their names must appear in the converted screen's text in DOM order (static reading order). */
const CELL_ROLES: Record<string, true> = { cell: true, columnheader: true, rowheader: true };

/** Roles whose StaticText children are the field's value, covered by the field itself. */
const FIELD_ROLES: Record<string, true> = { textbox: true, searchbox: true, combobox: true };

interface CdpAxNode {
  nodeId: string;
  ignored: boolean;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
  backendDOMNodeId?: number;
}

/** Named, non-ignored AX nodes under `rootSelector` from Chrome's full AX tree. */
export async function browserAxNodes(page: Page, rootSelector: string): Promise<AxNamed[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: rootSelector });
    if (!nodeId) throw new Error(`browserAxNodes: no element matches ${rootSelector}`);
    const { node } = await cdp.send("DOM.describeNode", { nodeId });
    const { nodes } = (await cdp.send("Accessibility.getFullAXTree", {})) as unknown as { nodes: CdpAxNode[] };
    const byId = new Map(nodes.map((n) => [n.nodeId, n]));
    const start = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
    if (!start) throw new Error(`browserAxNodes: ${rootSelector} is not in the accessibility tree`);
    const out: AxNamed[] = [];
    const visit = (n: CdpAxNode, inField: boolean) => {
      const role = n.role?.value ?? "";
      if (!n.ignored && CHECKED_ROLES[role] && !(role === "StaticText" && inField)) {
        const name = normalizeName(n.name?.value ?? "");
        if (name) out.push({ role, name });
      }
      for (const id of n.childIds ?? []) {
        const child = byId.get(id);
        if (child) visit(child, inField || (!n.ignored && !!FIELD_ROLES[role]));
      }
    };
    visit(start, false);
    return out;
  } finally {
    await cdp.detach();
  }
}

/**
 * Every text and SVG text run of `n`'s subtree, and every input button's caption (its `value`, painted by the control),
 * single-space joined in `walk` order. `named`: a descendant's own name (`a11y.label`, `alt`, `<title>`) replaces its
 * content, as in Chrome's name-from-content.
 */
function subtreeText(n: SemNode, named = false): string {
  const parts: string[] = [];
  let skipBelow = Number.POSITIVE_INFINITY;
  walk(n, (m, depth) => {
    if (depth > skipBelow) return;
    skipBelow = Number.POSITIVE_INFINITY;
    const own = m.a11y?.label ?? (m.kind === "image" ? m.alt : m.kind === "svg" ? m.label : undefined);
    if (named && depth > 0 && own) {
      parts.push(own);
      skipBelow = depth;
    } else if (m.kind === "text") parts.push(m.runs.map((r) => r.text).join(""));
    else if (m.kind === "svg") for (const t of m.texts ?? []) parts.push(t.text);
    else if (m.kind === "control" && m.control === "button" && !m.files && m.value !== undefined && !m.content.length)
      parts.push(m.value);
  });
  return normalizeName(parts.join(" "));
}

/** The names an IR node offers to assistive technology (normalised, possibly empty). */
function offeredNames(n: SemNode): string[] {
  const names = [n.a11y?.label ?? ""];
  if (n.kind === "image") names.push(n.alt ?? "");
  if (n.kind === "svg") {
    const texts = (n.texts ?? []).map((t) => t.text);
    names.push(n.label ?? "", ...texts, texts.join(" "));
  }
  if (n.kind === "control") {
    if (n.label) names.push(subtreeText(n.label));
    names.push(n.placeholder ?? "", n.value ?? "", ...(n.options ?? []).map((o) => o.label));
  }
  if (
    n.kind === "text" ||
    n.kind === "control" ||
    n.a11y?.heading !== undefined ||
    n.action ||
    n.a11y?.trait === "isHeader"
  )
    names.push(subtreeText(n), subtreeText(n, true));
  return names.map(normalizeName).filter(Boolean);
}

/** The words of a name in sorted order: a node's name parts in the IR follow its measured layout (`controls.ts` sorts a button's content by y, x), not DOM order, and reading order is out of scope. */
const wordBag = (s: string) => s.split(" ").sort().join(" ");

/** Browser nodes with no IR counterpart. */
export function axParity(ax: AxNamed[], screen: Screen): AxNamed[] {
  const nodes: SemNode[] = [];
  walk(screen.root, (n) => nodes.push(n));
  const text = subtreeText(screen.root);
  // Earliest-match greedy search: finds an order-preserving embedding of the cell names whenever one exists.
  let from = 0;
  return ax.filter(({ role, name }) => {
    if (CELL_ROLES[role]) {
      const at = text.indexOf(name, from);
      if (at < 0) return true;
      from = at + name.length;
      if (role === "cell") return false;
    }
    if (role === "StaticText") return !text.includes(name);
    const fits = CHECKED_ROLES[role];
    return !nodes.some(
      (n) => fits?.(n) && offeredNames(n).some((s) => s.includes(name) || wordBag(s) === wordBag(name)),
    );
  });
}
