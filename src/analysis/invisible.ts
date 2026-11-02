/** Paint that is invisible at rest and can never become visible is wasted render work: drop it from the IR. */
import { type SemNode, walk } from "../model/semantic.ts";

/**
 * Fully transparent, not animated, never revealed by a pressed/focused state, and silent: Chrome
 * keeps `opacity: 0` content in the accessibility tree (a visually hidden native `<input>` behind
 * a custom checkbox) unless `aria-hidden` removes it. So an `aria-hidden` box goes whatever it
 * holds — Radix's form-value `<input aria-hidden>` beside its toggle is neither seen nor announced.
 * Pointer-activatable content remains even when aria-hidden: visual and accessibility silence do not remove a tap.
 */
function invisible(n: SemNode): boolean {
  if (n.style.opacity !== 0 || n.motion !== undefined || n.diagnostics.some((d) => d.feature.startsWith("animation-")))
    return false;
  const muted = !!n.a11y?.hidden;
  let silent = true;
  walk(n, (d) => {
    if (d.states?.pressed || d.states?.focused) silent = false;
    else if (d.hitTesting !== false && !d.a11y?.disabled && (d.action || (d.kind === "control" && !d.disabled)))
      silent = false;
    else if (
      !muted &&
      (d.kind === "text" ||
        d.kind === "control" ||
        (d.kind === "image" && d.alt) ||
        (d.kind === "svg" && d.label) ||
        d.a11y?.label)
    )
      silent = false;
  });
  return silent;
}

/** The in-flow children of a node: a stack's or grid's children, a control's label and content. */
function inFlowOf(n: SemNode): SemNode[] {
  if (n.kind === "stack" || n.kind === "grid") return n.children;
  return n.kind === "control" ? [...(n.label ? [n.label] : []), ...n.content] : [];
}

/** Removes invisible overlays; an invisible in-flow node keeps its space but draws nothing. Never touches `n` itself. */
export function dropInvisible(n: SemNode): void {
  n.overlays = n.overlays.filter((o) => !invisible(o.node));
  const inFlow = inFlowOf(n);
  for (const c of inFlow) {
    if (!invisible(c)) continue;
    c.style.hidden = true;
    delete c.style.opacity;
  }
  for (const o of n.overlays) dropInvisible(o.node);
  for (const c of inFlow) dropInvisible(c);
}

/** Keeps `hitTesting: false` where it changes a tap: on overlays (they paint over siblings), outermost only. */
export function pruneHitTesting(n: SemNode, overlay = false, inside = false): void {
  if (n.hitTesting === false && (inside || !overlay)) delete n.hitTesting;
  const off = inside || n.hitTesting === false;
  for (const o of n.overlays) pruneHitTesting(o.node, true, off);
  for (const c of inFlowOf(n)) pruneHitTesting(c, false, off);
}
