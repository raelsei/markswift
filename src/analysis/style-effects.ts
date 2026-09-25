/** Visual effects, clipping, visibility and design-token hints. */
import type { LayoutNode } from "../model/layout.ts";
import type { Style } from "../model/semantic.ts";
import { parseColor, px, parseFilters, parseTransform, parseOrigin, parseBlendMode, parseClipPath, parseBackgroundImage, resolvePaint } from "../css/index.ts";
import { classColorHints } from "./class-hints.ts";
import { imagePaint } from "./style-background.ts";

export function applyEffects(n: LayoutNode, style: Style, notes: string[]): void {
  const s = n.styles;
  const { w, h } = n.bounds;
  const op = parseFloat(s["opacity"] ?? "1");
  if (op < 1) style.opacity = op;
  const ox = s["overflow-x"];
  const oy = s["overflow-y"];
  if (ox === "hidden" || ox === "clip" || oy === "hidden" || oy === "clip") style.clip = true;
  const { filters, unsupported } = parseFilters(s["filter"]);
  for (const f of unsupported) notes.push(`unmapped: filter ${f.slice(0, 40)}`);
  if (filters.length === 1 && filters[0]!.kind === "blur") style.blur = filters[0]!.radius;
  else if (filters.length) style.filters = filters;
  for (const f of filters) if (f.kind === "drop-shadow" || f.kind === "sepia") notes.push(`approximated: filter ${f.kind}`);
  const bf = s["backdrop-filter"];
  if (bf && bf !== "none") {
    const m = /blur\(([\d.]+)px\)/.exec(bf);
    style.backdropBlur = m ? +m[1]! : 0;
    notes.push("approximated: backdrop-filter → translucent fill only (no blur)");
  }
  const tf = parseTransform(s["transform"]);
  if (tf?.flattened) notes.push("approximated: transform matrix3d flattened to its x/y projection");
  if (tf && (tf.rotate !== 0 || tf.scaleX !== 1 || tf.scaleY !== 1 || tf.tx !== 0 || tf.ty !== 0 || tf.skewX !== undefined || tf.skewY !== undefined)) {
    const { flattened: _, ...affine } = tf;
    style.transform = affine;
    const origin = parseOrigin(s["transform-origin"]);
    if (origin) style.transform.origin = origin;
  } else if (s["transform"] && s["transform"] !== "none" && !tf) notes.push(`unmapped: transform ${s["transform"].slice(0, 40)}`);
  if (style.shadows.some(sh => sh.inset && sh.blur > 0)) notes.push("approximated: inset shadow blur → native Gaussian blur");
  // Every CSS `<blend-mode>` is a PDF blend function, and so is every SwiftUI `BlendMode`, so a
  // recognised keyword maps by name with no loss; the emitter does the naming. Anything outside
  // the spec's list is reported rather than silently painted `normal`.
  const blend = s["mix-blend-mode"];
  if (blend && blend !== "normal") {
    if (parseBlendMode(blend)) style.blend = blend;
    else notes.push(`unmapped: mix-blend-mode ${blend}`);
  }

  const cp = s["clip-path"];
  if (cp && cp !== "none") {
    const shape = parseClipPath(cp, w, h);
    if (shape) style.clipPath = shape;
    else notes.push(`unmapped: clip-path ${cp.slice(0, 40)}`);
  }
  const mi = s["mask-image"];
  if (mi && mi !== "none") {
    const masks = parseBackgroundImage(mi);
    const first = masks[masks.length - 1]!;
    if (masks.length > 1) notes.push("approximated: mask-image first layer only");
    if (first.kind === "unsupported") notes.push(`unmapped: mask-image ${first.raw.slice(0, 40)}`);
    else if (first.kind === "image") style.mask = imagePaint(first.url, s, "mask", 0, w, h);
    else style.mask = resolvePaint(first, w, h);
  }
  const vis = s["visibility"];
  if (vis === "hidden" || vis === "collapse") {
    style.hidden = true;
    if (vis === "collapse") notes.push("approximated: visibility: collapse → hidden (space kept)");
  }
  if (s["position"] === "sticky") notes.push("approximated: position: sticky (snapshot position)");
  const os = s["outline-style"];
  const ow = px(s["outline-width"]);
  const oc = parseColor(s["outline-color"]);
  if (os && os !== "none" && ow > 0 && oc && oc.a > 0) {
    const known = os === "solid" || os === "dashed" || os === "dotted" || os === "double";
    if (!known) notes.push(`approximated: outline-style ${os} → solid`);
    style.outline = { width: ow, color: oc, style: known ? os : "solid", offset: px(s["outline-offset"]) };
  }
  // Colour-name hints: `var(--x)` from an inline style, plus the semantic part of any colour
  // utility on the class list. Both are names the design gave a colour, and `emit/tokens.ts`
  // promotes a consistent hint to the token's name (`bg-blue-500` → `Color.blue500`).
  const tokens = [...[...(n.attrs["style"] ?? "").matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]!), ...classColorHints(n.attrs)];
  if (tokens.length) style.tokens = [...new Set(tokens)];
}
