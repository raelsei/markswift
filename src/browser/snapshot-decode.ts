import type { DomSnapshot, Raw } from "./snapshot-types.ts";
import { attachLayoutColumns } from "./snapshot-columns.ts";
import { markCurrentSrc } from "./snapshot-assets.ts";

/**
 * @param snap     snapshot as painted (styles incl. transform matrices, paint order)
 * @param boxes    optional snapshot taken with `transform: none` on every element;
 *                 its bounds/offsets are the untransformed layout boxes and win over `snap`'s.
 */
export function snapshotToTree(snap: DomSnapshot, boxes?: DomSnapshot): Raw {
  const doc = snap.documents[0];
  if (!doc) throw new Error("empty snapshot");
  const S = snap.strings;
  const str = (i: number) => (i >= 0 ? S[i]! : "");
  const n = doc.nodes.nodeType.length;
  const raws: Raw[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const attrs: Record<string, string> = {};
    const a = doc.nodes.attributes[i] ?? [];
    for (let k = 0; k + 1 < a.length; k += 2) attrs[str(a[k]!).toLowerCase()] = str(a[k + 1]!);
    raws[i] = {
      idx: i,
      type: doc.nodes.nodeType[i]!,
      name: str(doc.nodes.nodeName[i]!).toLowerCase(),
      value: str(doc.nodes.nodeValue[i]!),
      attrs,
      styles: {},
      children: [],
    };
  }
  normalizeFormState(doc.nodes, raws, str);
  for (let i = 0; i < n; i++) {
    const p = doc.nodes.parentIndex[i]!;
    if (p >= 0) {
      raws[p]!.children.push(raws[i]!);
      raws[i]!.parent = raws[p];
    }
  }
  const pseudo = doc.nodes.pseudoType;
  if (pseudo) for (let k = 0; k < pseudo.index.length; k++) raws[pseudo.index[k]!]!.pseudo = str(pseudo.value[k]!);
  attachLayoutColumns(doc, raws, S, boxes);
  const cur = doc.nodes.currentSourceURL;
  if (cur) {
    const base = str(doc.documentURL);
    for (let k = 0; k < cur.index.length; k++) markCurrentSrc(raws[cur.index[k]!]!, str(cur.value[k]!), base);
  }
  const html = raws.find((r) => r.type === 1 && r.name === "html");
  if (!html) throw new Error("no <html> in snapshot");
  return html;
}

/**
 * CDP keeps live control properties in sparse columns while `attributes` retain initial markup.
 * Project the browser's current state back onto the attribute-shaped layout IR before inference.
 */
function normalizeFormState(nodes: DomSnapshot["documents"][number]["nodes"], raws: Raw[], str: (index: number) => string): void {
  for (const [field, name] of [[nodes.inputValue, "input"], [nodes.textValue, "textarea"]] as const) {
    if (!field) continue;
    for (let k = 0; k < field.index.length; k++) {
      const raw = raws[field.index[k]!]!;
      if (raw.name === name) raw.attrs.value = str(field.value[k]!);
    }
  }
  if (nodes.inputChecked) {
    for (const raw of raws) if (raw.name === "input") delete raw.attrs.checked;
    for (const i of nodes.inputChecked.index) if (raws[i]?.name === "input") raws[i]!.attrs.checked = "";
  }
  if (nodes.optionSelected) {
    for (const raw of raws) if (raw.name === "option") delete raw.attrs.selected;
    for (const i of nodes.optionSelected.index) if (raws[i]?.name === "option") raws[i]!.attrs.selected = "";
  }
}
