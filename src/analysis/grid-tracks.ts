/** Authored grid tracks the runtime `MarkswiftTracks` reproduces, admitted only when they reproduce the capture. */
import type { LayoutNode } from "../model/layout.ts";
import type { GridTemplate } from "../model/semantic.ts";
import { parseTrackTemplate, px } from "../css/index.ts";
import { insetsOf, outOfFlow } from "./geometry.ts";

/** Column widths for a content width, mirroring MarkswiftTracks.columns (runtime/tracks.swift). */
export function solveTracks(
  t: GridTemplate,
  width: number,
  gap: number,
  count: number,
  autoWidths: number[],
): number[] {
  if (t.autoRepeat) {
    let n = Math.max(1, Math.floor((width + gap) / (t.autoRepeat.min + gap)));
    if (t.autoRepeat.mode === "fit") n = Math.min(n, Math.max(1, count)); // auto-fit collapses empty tracks
    return Array(n).fill(Math.max(0, (width - (n - 1) * gap) / n));
  }
  const sizes = t.tracks.map((k, c) => (k.kind === "px" ? k.px : k.kind === "auto" ? (autoWidths[c] ?? 0) : 0));
  const frs = t.tracks.reduce((s, k) => s + (k.kind === "fr" ? k.fr : 0), 0);
  const free = Math.max(0, width - sizes.reduce((a, b) => a + b, 0) - (t.tracks.length - 1) * gap);
  return t.tracks.map((k, c) => (k.kind === "fr" ? (frs > 0 ? (free * k.fr) / frs : 0) : sizes[c]!));
}
// ponytail: fr tracks are minmax(0, fr); CSS 1fr is minmax(auto, 1fr) and never shrinks below min-content.
// Admission proves the captured width only; measure min-content in the runtime if narrow widths diverge.

const near = (a: number, b: number) => Math.abs(a - b) <= 1;
const START: Record<string, true> = { normal: true, stretch: true, start: true, "flex-start": true };

/** Every `#text` under `n` sits on one line, so its captured width is its max-content width. */
function singleLine(n: LayoutNode): boolean {
  return n.tag === "#text" ? (n.lines?.length ?? 0) <= 1 : n.children.every(singleLine);
}

/** The authored template when the solver reproduces every captured cell within 1px; else undefined. */
export function admitTracks(n: LayoutNode): { template: GridTemplate; stretch: boolean } | undefined {
  const s = n.styles;
  if (s.display !== "grid" && s.display !== "inline-grid") return undefined;
  if (s.direction === "rtl" || (s["grid-auto-flow"] ?? "row") !== "row") return undefined;
  if (n.preferredSize?.gridTemplateRows !== undefined) return undefined;
  const template = parseTrackTemplate(n.preferredSize?.gridTemplateColumns);
  if (!template || (!template.autoRepeat && template.tracks.every((t) => t.kind === "px"))) return undefined;
  const items = n.children.filter((c) => c.tag !== "#text" && c.styles.display !== "none" && !outOfFlow(c));
  if (!items.length || n.children.some((c) => c.tag === "#text" && (c.text ?? "").trim())) return undefined;
  const alignItems = s["align-items"] ?? "normal";
  if (!START[alignItems]) return undefined;
  for (const item of items) {
    const self = item.styles["align-self"] ?? "auto";
    if (self !== "auto" && self !== "normal" && self !== alignItems) return undefined;
  }
  for (const item of items) {
    if (px(item.styles["margin-left"]) !== 0 || px(item.styles["margin-right"]) !== 0) return undefined;
    const height = item.preferredSize?.height ?? "auto";
    if (height !== "auto") return undefined;
  }
  const firstXs: number[] = [];
  for (const item of items)
    if (near(item.bounds.y, items[0]!.bounds.y) && !firstXs.some((x) => near(x, item.bounds.x)))
      firstXs.push(item.bounds.x);
  const k = template.autoRepeat ? firstXs.length : template.tracks.length;
  const autoWidths: number[] = [];
  for (const [i, item] of items.entries()) {
    const c = i % k;
    if (template.tracks[c]?.kind !== "auto") continue;
    if (!/px$/.test(item.preferredSize?.width ?? "") && !singleLine(item)) return undefined;
    autoWidths[c] = Math.max(autoWidths[c] ?? 0, item.bounds.w);
  }
  const insets = insetsOf(s);
  const x0 = n.bounds.x + insets[3];
  const W = n.bounds.w - insets[1] - insets[3];
  const gap = px(s["column-gap"]);
  const cols = solveTracks(template, W, gap, items.length, autoWidths);
  if (cols.length !== k) return undefined;
  const starts = cols.map((_, c) => x0 + cols.slice(0, c).reduce((sum, w) => sum + w + gap, 0));
  if (!items.every((item, i) => near(item.bounds.x, starts[i % k]!) && near(item.bounds.w, cols[i % k]!)))
    return undefined;
  // Rows: row-major DOM order, each item's margin box at its row's top, each row as tall as its
  // tallest margin box (implicit auto rows; the runtime sizes rows the same way).
  let top = n.bounds.y + insets[0];
  for (let r = 0; r * k < items.length; r++) {
    let bottom = top;
    for (const item of items.slice(r * k, r * k + k)) {
      const mt = px(item.styles["margin-top"]);
      if (!near(item.bounds.y - mt, top)) return undefined;
      bottom = Math.max(bottom, item.bounds.y + item.bounds.h + px(item.styles["margin-bottom"]));
    }
    top = bottom + px(s["row-gap"]);
  }
  return { template, stretch: alignItems === "normal" || alignItems === "stretch" };
}
