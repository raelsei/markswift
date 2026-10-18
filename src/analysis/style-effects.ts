/** Visual effects, clipping, visibility and design-token hints. */
import type { LayoutNode } from "../model/layout.ts";
import { type Style, type Diagnostic, addDiagnostic } from "../model/semantic.ts";
import {
  parseColor,
  px,
  parseFilters,
  cssTransform,
  parseBlendMode,
  parseClipPath,
  parseBackgroundImage,
  resolvePaint,
} from "../css/index.ts";
import { classColorHints } from "./class-hints.ts";
import { imagePaint } from "./style-background.ts";

export function applyEffects(n: LayoutNode, style: Style, diagnostics: Diagnostic[]): void {
  const s = n.styles;
  const { w, h } = n.bounds;
  const op = parseFloat(s["opacity"] ?? "1");
  if (op < 1) style.opacity = op;
  const ox = s["overflow-x"];
  const oy = s["overflow-y"];
  if (ox === "hidden" || ox === "clip" || oy === "hidden" || oy === "clip") style.clip = true;
  const { filters, unsupported } = parseFilters(s["filter"]);
  for (const f of unsupported) addDiagnostic(diagnostics, "unmapped", "filter", `filter ${f.slice(0, 40)}`);
  if (filters.length === 1 && filters[0]!.kind === "blur") style.blur = filters[0]!.radius;
  else if (filters.length) style.filters = filters;
  for (const f of filters)
    if (f.kind === "drop-shadow" || f.kind === "sepia")
      addDiagnostic(diagnostics, "approximated", `filter: ${f.kind}()`, `filter ${f.kind}`);
  const bf = s["backdrop-filter"];
  if (bf && bf !== "none")
    addDiagnostic(diagnostics, "approximated", "backdrop-filter", "backdrop-filter → translucent fill only (no blur)");
  const { transform, losses } = cssTransform(s, w, h);
  for (const l of losses) addDiagnostic(diagnostics, l.level, l.feature, l.message);
  if (transform) style.transform = transform;
  if (style.shadows.some((sh) => sh.inset && sh.blur > 0))
    addDiagnostic(diagnostics, "approximated", "box-shadow: inset", "inset shadow blur → native Gaussian blur");
  // Every CSS `<blend-mode>` is a PDF blend function, and so is every SwiftUI `BlendMode`, so a
  // recognised keyword maps by name with no loss; the emitter does the naming. Anything outside
  // the spec's list is reported rather than silently painted `normal`.
  const blend = s["mix-blend-mode"];
  if (blend && blend !== "normal") {
    const mode = parseBlendMode(blend);
    if (!mode) addDiagnostic(diagnostics, "unmapped", "mix-blend-mode", `mix-blend-mode ${blend}`);
    else if (mode !== "normal") style.blend = mode;
  }

  const cp = s["clip-path"];
  if (cp && cp !== "none") {
    const shape = parseClipPath(cp, w, h);
    if (shape) style.clipPath = shape;
    else addDiagnostic(diagnostics, "unmapped", "clip-path", `clip-path ${cp.slice(0, 40)}`);
  }
  const mi = s["mask-image"];
  if (mi && mi !== "none") {
    const dropped: string[] = [];
    const masks = parseBackgroundImage(mi, dropped);
    for (const x of dropped) addDiagnostic(diagnostics, "approximated", "mask-image", `${x} ignored`);
    const first = masks[masks.length - 1]!;
    if (masks.length > 1) addDiagnostic(diagnostics, "approximated", "mask-image", "mask-image first layer only");
    if (first.kind === "unsupported")
      addDiagnostic(diagnostics, "unmapped", "mask-image", `mask-image ${first.raw.slice(0, 40)}`);
    else if (first.kind === "image") style.mask = imagePaint(first.url, s, "mask", 0, w, h, diagnostics);
    else {
      if (first.kind !== "solid" && first.space && first.space !== "srgb")
        addDiagnostic(
          diagnostics,
          "approximated",
          "mask-image: linear-gradient()",
          `gradient interpolation in ${first.space} → SwiftUI default interpolation`,
        );
      style.mask = resolvePaint(first, w, h);
    }
  }
  const vis = s["visibility"];
  if (vis === "hidden" || vis === "collapse") {
    style.hidden = true;
    if (vis === "collapse")
      addDiagnostic(diagnostics, "approximated", "visibility: collapse", "visibility: collapse → hidden (space kept)");
  }
  const animation = s["animation-name"];
  // A node with captured keyframe motion (n.motion) is reported by analysis/motion.ts instead.
  if (animation && animation !== "none" && !n.motion?.animations && !n.motion?.reduced)
    addDiagnostic(
      diagnostics,
      "unmapped",
      "animation-name",
      `animation ${animation.slice(0, 40)} → animated element rendered at end state (infinite animations at their base state); no motion is generated`,
    );
  if (s["position"] === "sticky")
    addDiagnostic(diagnostics, "approximated", "position: sticky", "position: sticky (snapshot position)");
  const os = s["outline-style"];
  const ow = px(s["outline-width"]);
  const oc = parseColor(s["outline-color"]);
  if (os && os !== "none" && ow > 0 && oc && oc.a > 0) {
    const known = os === "solid" || os === "dashed" || os === "dotted" || os === "double";
    if (!known) addDiagnostic(diagnostics, "approximated", "outline-style", `outline-style ${os} → solid`);
    style.outline = { width: ow, color: oc, style: known ? os : "solid", offset: px(s["outline-offset"]) };
  }
  // Colour-name hints: `var(--x)` from an inline style, plus the semantic part of any colour
  // utility on the class list. Both are names the design gave a colour, and `swift/tokens`
  // promotes a consistent hint to the token's name (`bg-blue-500` → `Palette.blue500`).
  const tokens = [
    ...[...(n.attrs["style"] ?? "").matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]!),
    ...classColorHints(n.attrs),
  ];
  if (tokens.length) style.tokens = [...new Set(tokens)];
}
