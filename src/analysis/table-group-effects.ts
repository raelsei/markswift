import type { LayoutNode } from "../model/layout.ts";

/** Flattened table paint layers cannot apply one effect to a section or row's descendants. */
export function tableGroupEffectReason(node: LayoutNode): string | undefined {
  const styles = node.styles;
  const opacity = styles.opacity;
  if (opacity && Number(opacity) !== 1) return reason(node, "opacity", opacity);
  for (const property of ["filter", "backdrop-filter", "mask-image", "clip-path", "transform"] as const) {
    const value = styles[property];
    if (value && value !== "none") return reason(node, property, value);
  }
  const blend = styles["mix-blend-mode"];
  if (blend && blend !== "normal") return reason(node, "mix-blend-mode", blend);
  const clip = styles.clip;
  if (clip && clip !== "auto") return reason(node, "clip", clip);
  for (const property of ["overflow-x", "overflow-y"] as const) {
    const value = styles[property];
    if (value && value !== "visible") return reason(node, property, value);
  }
}

function reason(node: LayoutNode, property: string, value: string): string {
  return `<${node.tag}> ${property}: ${value} requires grouped descendants; native table layers cannot preserve the group effect`;
}
