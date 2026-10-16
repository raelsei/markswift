/** Tooltips (D-HOVER): `title` and captured tooltip layers become `SemBase.tooltip` — `.help` plus an accessibility hint, never drawn. */
import type { Layer, LayoutDoc, LayoutNode } from "../model/layout.ts";
import { type SemBase, type SemNode, walk } from "../model/semantic.ts";
import { textContent } from "./text-runs.ts";

const TOOLTIP_RELATIONS: Record<string, true> = { "aria-describedby": true, interestfor: true };

const find = (n: LayoutNode, test: (n: LayoutNode) => boolean): LayoutNode | undefined =>
  test(n) ? n : n.children.reduce<LayoutNode | undefined>((hit, c) => hit ?? find(c, test), undefined);

/** An element's `title` as tooltip text; an iframe's title is its name, not a tooltip. */
export function titleOf(n: LayoutNode): string {
  return n.tag === "iframe" ? "" : (n.attrs["title"] ?? "").replace(/\s+/g, " ").trim();
}

/** Appends `text` to `base.tooltip` unless blank or already there; parts join with "; ". */
export function addTooltip(base: SemBase, text: string): void {
  if (!text) return;
  const parts = base.tooltip ? base.tooltip.split("; ") : [];
  if (!parts.includes(text)) base.tooltip = [...parts, text].join("; ");
}

/**
 * A layer that only describes its trigger: tooltip content (`role=tooltip`, shadcn's `tooltip-content` slot), an
 * `aria-describedby`/`interestfor` relation, or a hover layer of a shadcn tooltip trigger (`root` resolves the trigger;
 * without it that last rule cannot fire). 060 skips these layers.
 */
export function isTooltipLayer(layer: Layer, root?: LayoutNode): boolean {
  if (TOOLTIP_RELATIONS[layer.relation]) return true;
  if (
    layer.nodes.some((n) => find(n, (d) => d.attrs["role"] === "tooltip" || d.attrs["data-slot"] === "tooltip-content"))
  )
    return true;
  const trigger = layer.activation === "hover" && root ? find(root, (d) => d.id === layer.trigger) : undefined;
  return trigger?.attrs["data-slot"] === "tooltip-trigger";
}

/** Each tooltip layer's text becomes its trigger's `tooltip`: the `role=tooltip` element's (Radix pairs its visible
 * content with a visually hidden copy that carries the role), else the whole layer's. */
// ponytail: a trigger that became an inline text run has no SemNode of its own and keeps no tooltip; split the run if a design needs it.
export function applyTooltips(root: SemNode, doc: LayoutDoc): void {
  const layers = (doc.layers ?? []).filter((l) => isTooltipLayer(l, doc.root));
  if (!layers.length) return;
  walk(root, (n) => {
    for (const l of layers) {
      if (n.id !== l.trigger) continue;
      const role = l.nodes.map((r) => find(r, (d) => d.attrs["role"] === "tooltip")).find((r) => r !== undefined);
      const text = role ? textContent(role) : l.nodes.map(textContent).join(" ");
      addTooltip(n, text.replace(/\s+/g, " ").trim());
    }
  });
}
