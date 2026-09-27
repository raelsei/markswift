import type { LayoutNode } from "../model/layout.ts";
import type { ControlSpec } from "./controls.ts";
import { insetsOf } from "./geometry.ts";

/** The captured summary is the trigger; closed content has no usable measured geometry. */
export function applyDisclosureInput(n: LayoutNode, spec: ControlSpec): void {
  if ("open" in n.attrs) spec.expanded = true;
  const summary = n.children.find(child => child.tag === "summary");
  if (!summary) {
    spec.notes.push("approximated: <details> has no captured summary; native disclosure supplies its default trigger");
    return;
  }
  // Style/layout reads can cause CDP to expose boxes inside a closed content-visibility subtree.
  // Those boxes are not painted browser content and cannot establish an opening-state layout.
  const content = spec.expanded ? n.children.filter(child => child !== summary && child.bounds.w > 0 && child.bounds.h > 0 && (child.tag !== "#text" || child.text?.trim())) : [];
  const gap = content.length ? Math.min(...content.map(child => child.bounds.y)) - summary.bounds.y - summary.bounds.h : 0;
  const contentLeft = n.bounds.x + insetsOf(n.styles)[3];
  const labelInset = summary.bounds.x - contentLeft, contentInset = content.length ? content[0]!.bounds.x - contentLeft : 0;
  const ordered = [...content].sort((a, b) => a.bounds.y - b.bounds.y);
  const gaps = ordered.slice(1).map((child, i) => child.bounds.y - ordered[i]!.bounds.y - ordered[i]!.bounds.h);
  if (labelInset < -.5 || contentInset < -.5 || content.some(child => Math.abs(child.bounds.x - contentLeft - contentInset) > .5
    || /^(absolute|fixed)$/.test(child.styles.position ?? "")) || gaps.some(value => value < -.5 || Math.abs(value - gaps[0]!) > .5)) {
    spec.notes.push("approximated: disclosure content has unequal/negative leading insets, positioned children or nonuniform vertical gaps; native disclosure layout retained");
    return;
  }
  if (gap < -0.5 || !Number.isFinite(gap) || !/^(block|list-item)$/.test(summary.styles.display ?? "block")
    || /flex|grid/.test(n.styles.display ?? "block")) {
    spec.notes.push("approximated: disclosure summary/content layout is not a supported vertical captured flow; native disclosure spacing retained");
    return;
  }
  spec.disclosureLayout = { gap: Math.max(0, gap), labelInset: Math.max(0, labelInset), contentInset: Math.max(0, contentInset), contentAvailable: content.length > 0 };
  if (!spec.expanded && !content.length) spec.notes.push("approximated: closed <details> descendants have no captured layout; opening exposes only captured content");
  const markers = summary.children.filter(child => child.tag === "::marker");
  if (markers.some(marker => marker.styles.content === "normal" && /^disclosure-/.test(marker.styles["list-style-type"] ?? "") && !marker.markerLayout?.disclosureControl)) {
    spec.notes.push("approximated: disclosure marker state is not proved to come from UA rules; captured marker remains static when toggled");
  }
}
