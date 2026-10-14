/** Paint that is invisible at rest and can never become visible is wasted render work: drop it from the IR. */
import { type SemNode, walk } from "../model/semantic.ts";

/**
 * Fully transparent, not animated, never revealed by a pressed/focused state, and silent: Chrome
 * keeps `opacity: 0` content in the accessibility tree (a visually hidden native `<input>` behind
 * a custom checkbox) unless `aria-hidden` removes it. So an `aria-hidden` box goes whatever it
 * holds — Radix's form-value `<input aria-hidden>` beside its toggle is neither seen nor announced.
 * ponytail: `pointer-events` is not captured; an invisible aria-hidden control the design still lets
 * the pointer hit would lose that tap. Capture `pointer-events` if a design relies on it.
 */
function invisible(n: SemNode): boolean {
  if (n.style.opacity !== 0 || n.diagnostics.some((d) => d.feature === "animation-name")) return false;
  const muted = !!n.a11y?.hidden;
  let silent = true;
  walk(n, (d) => {
    if (d.states?.pressed || d.states?.focused) silent = false;
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
