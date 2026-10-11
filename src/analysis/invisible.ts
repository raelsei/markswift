/** Paint that is invisible at rest and can never become visible is wasted render work: drop it from the IR. */
import { type SemNode, walk } from "../model/semantic.ts";

/**
 * Fully transparent, not animated, never revealed by a pressed/focused state, and silent: Chrome
 * keeps `opacity: 0` content in the accessibility tree (a visually hidden native `<input>` behind
 * a custom checkbox), so only pure paint qualifies.
 */
function invisible(n: SemNode): boolean {
  if (n.style.opacity !== 0 || n.diagnostics.some((d) => d.feature === "animation-name")) return false;
  let silent = true;
  walk(n, (d) => {
    if (
      d.states?.pressed ||
      d.states?.focused ||
      d.kind === "text" ||
      d.kind === "control" ||
      (d.kind === "image" && d.alt) ||
      (d.kind === "svg" && d.label) ||
      d.a11y?.label
    )
      silent = false;
  });
  return silent;
}

/** Removes invisible overlays; an invisible in-flow node keeps its space but draws nothing. Never touches `n` itself. */
export function dropInvisible(n: SemNode): void {
  n.overlays = n.overlays.filter((o) => !invisible(o.node));
  const inFlow =
    n.kind === "stack" || n.kind === "grid"
      ? n.children
      : n.kind === "control"
        ? [...(n.label ? [n.label] : []), ...n.content]
        : [];
  for (const c of inFlow) {
    if (!invisible(c)) continue;
    c.style.hidden = true;
    delete c.style.opacity;
  }
  for (const o of n.overlays) dropInvisible(o.node);
  for (const c of inFlow) dropInvisible(c);
}
