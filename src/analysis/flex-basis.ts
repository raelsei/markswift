import type { LayoutNode } from "../model/layout.ts";
import type { InferenceContext } from "./context.ts";
import { parseDeclared } from "../css/syntax.ts";

/** A percentage is authored intent; it never comes from a measured width ratio. */
export function percentageBasis(value: string | undefined): number | undefined {
  if (value === undefined || !/^(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value.trim())) return;
  const fraction = Number.parseFloat(value) / 100;
  return Number.isFinite(fraction) ? fraction : undefined;
}

/** Captures prove external ancestors; legacy trees can prove explicit pixel-root block chains. */
export function definiteFlexInlineSize(n: LayoutNode, ctx?: InferenceContext): boolean {
  if (n.preferredSize?.inlineSizeDefinite !== undefined) return n.preferredSize.inlineSizeDefinite;
  const width = n.preferredSize?.width ?? parseDeclared(n.attrs.style).width ?? "auto";
  if (/^(?:\d+(?:\.\d*)?|\.\d+)px$/.test(width)) return true;
  if (!ctx || n === ctx.root) return false;
  const path = (node: LayoutNode): LayoutNode[] | undefined => {
    if (node === n) return [node];
    for (const child of node.children) {
      const found = path(child);
      if (found) return [node, ...found];
    }
  };
  const ancestors = path(ctx.root);
  const parent = ancestors?.[ancestors.length - 2];
  if (!parent || !/^(block|flow-root)$/.test(parent.styles.display ?? "block")
    || !/^(static|relative)?$/.test(n.styles.position ?? "")
    || !/^(none)?$/.test(n.styles.float ?? "")) return false;
  return (percentageBasis(width) !== undefined
    || (width === "auto" && /^(block|flow-root|flex|grid)$/.test(n.styles.display ?? "block")))
    && definiteFlexInlineSize(parent, ctx);
}
