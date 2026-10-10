import type { SemNode, Overlay } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import { colorExpr, edgeInsets, horizontalAlignment, indent, num, str, strokeStyle, verticalAlignment } from "./format.ts";
import { frameModifier } from "./frames.ts";
import { shapeExpr, fillModifier, blendedFillModifier, swiftBlend } from "./paint.ts";
import { borderSideModifiers } from "./borders.ts";
import { affineModifier, filterModifier, clipPathModifier, maskModifier } from "./effects.ts";
import { note } from "./diagnostics.ts";
import { insetShadowModifiers, outerShadowModifiers } from "./shadows.ts";
export function modifiers(n: SemNode, ctx: EmitContext): string[] {
  return [...boxModifiers(n, ctx), ...placementModifiers(n, ctx)];
}

/** The node's box: padding, frame, paint, borders, shadows, overlays, effects. A pressable control emits these inside its label, so they are its hit and press area. */
export function boxModifiers(n: SemNode, ctx: EmitContext): string[] {
  const m: string[] = [];
  const st = n.style;
  const [pt, pr, pb, pl] = n.padding;
  if (pt || pr || pb || pl) {
    if (pt === pr && pr === pb && pb === pl) m.push(`.padding(${num(pt)})`);
    else m.push(`.padding(${edgeInsets(n.padding)})`);
  }
  m.push(...frameModifier(n, ctx));
  // `object-fit: cover` overflows its box and `none` can; the browser clips both to the img box.
  if (n.kind === "image" && (n.contentMode === "cover" || n.contentMode === "none") && !st.clip) m.push(".clipped()");
  const shape = shapeExpr(st, n.frame.w, n.frame.h);
  // App mode draws fixed overlays outside a scrolling node's ScrollView (`containerExpr`).
  const hoisted = (o: Overlay) => o.fixed === true && ctx.mode === "app" && (n.kind === "stack" || n.kind === "grid") && n.scroll !== undefined;
  // Decorative absolutely-positioned children behind the content. `.background(A).background(B)`
  // puts B behind A, so apply the front-most background first.
  for (const o of [...n.overlays.filter((o) => o.layer === "background" && !hoisted(o))].reverse()) m.push(...overlayModifier(o, "background", ctx));
  // Inset shadows are part of the box paint: above fills, below every child.
  m.push(...insetShadowModifiers(n, ctx));
  // Fills are bottom-most first in the IR; the same chain rule means the top-most goes first.
  // Unless a layer carries a `background-blend-mode`: blending is against the layers *below it
  // inside this node*, so the whole stack has to live in one compositing group instead of a
  // chain of independent `.background` modifiers.
  if (st.fills.some((f) => f.kind !== "unsupported" && f.blend)) m.push(...blendedFillModifier(st.fills, n, shape, ctx));
  else for (const f of [...st.fills].reverse()) m.push(...fillModifier(f, n, shape, ctx));
  // backdrop-filter: over the flat canvases these designs use, blurring the backdrop changes
  // nothing visible, while SwiftUI materials add their own tint (badly in dark mode). The
  // translucent fill above already carries the "glass" look; keep the node flagged approximated.
  if (st.clip || (st.radius && (n.kind === "stack" || n.kind === "grid") && n.overlays.length)) m.push(`.clipShape(${shape})`);
  if (st.border) {
    const b = st.border;
    m.push(
      b.dashed
        ? `.overlay(${shape}.strokeBorder(${colorExpr(b.color, ctx, n.id)}, style: ${strokeStyle(b.width, "dashed")}))`
        : `.overlay(${shape}.strokeBorder(${colorExpr(b.color, ctx, n.id)}, lineWidth: ${num(b.width)}))`,
    );
  } else if (st.borderSides) m.push(...borderSideModifiers(n, ctx));
  if (st.outline && st.outline.width > 0 && st.outline.color.a > 0) {
    // A ring `offset` outside the border edge: the box shape grown by offset + half the stroke.
    const o = st.outline;
    if (o.style === "double") note(n, "approximated", "outline-style", "outline-style double drawn solid");
    m.push(`.overlay(${shape}.inset(by: ${num(-(o.offset + o.width / 2))}).stroke(${colorExpr(o.color, ctx, n.id)}, style: ${strokeStyle(o.width, o.style)}))`);
  }
  m.push(...outerShadowModifiers(n, ctx));
  for (const o of n.overlays.filter((o) => o.layer === "overlay" && !hoisted(o))) m.push(...overlayModifier(o, "overlay", ctx));
  // CSS effect order: filter → clip-path → mask → opacity.
  if (st.filters) for (const f of st.filters) m.push(...filterModifier(f, n, ctx));
  if (st.clipPath) m.push(clipPathModifier(st.clipPath, n, ctx));
  if (st.mask) m.push(...maskModifier(st.mask, n, ctx));
  // A disabled control's dimming is expressed twice over: the design's own `:disabled` opacity
  // and SwiftUI's automatic dimming from `.disabled(true)`. App mode keeps the native one (a
  // live control must dim the way the platform dims); fidelity keeps the design's number and
  // omits `.disabled` entirely, since nothing interacts with a rendered image.
  const nativeDim = ctx.mode === "app" && n.kind === "control" && n.disabled === true;
  if (st.opacity !== undefined && !nativeDim) m.push(`.opacity(${num(st.opacity)})`);
  if (st.blur !== undefined) m.push(`.blur(radius: ${num(st.blur)})`);
  if (st.blend) {
    const mode = swiftBlend(st.blend);
    if (mode) m.push(`.blendMode(${mode})`);
  }
  return m;
}

/**
 * Where the finished box sits and what it is: transform, self-alignment, visibility, a `<label>`'s
 * tap, accessibility. Nothing that paints or sizes the box: a button's box modifiers go inside its
 * label, and these stay outside it.
 */
export function placementModifiers(n: SemNode, ctx: EmitContext): string[] {
  const m: string[] = [];
  const st = n.style;
  if (st.transform) {
    const t = st.transform;
    if (t.skewX !== undefined || t.skewY !== undefined) m.push(affineModifier(t, n.frame.w, n.frame.h));
    else {
      const anchor = t.origin ? `UnitPoint(x: ${num(n.frame.w ? t.origin[0] / n.frame.w : 0.5)}, y: ${num(n.frame.h ? t.origin[1] / n.frame.h : 0.5)})` : ".center";
      if (t.scaleX !== 1 || t.scaleY !== 1) m.push(`.scaleEffect(x: ${num(t.scaleX)}, y: ${num(t.scaleY)}, anchor: ${anchor})`);
      if (t.rotate !== 0) m.push(`.rotationEffect(.degrees(${num(t.rotate)}), anchor: ${anchor})`);
      if (t.tx !== 0 || t.ty !== 0) m.push(`.offset(x: ${num(t.tx)}, y: ${num(t.ty)})`);
    }
  }
  // Where the browser's horizontal margins put the finished box inside its parent's content
  // box. After the paint, so the fills span the box the margins left, not the whole parent.
  if (n.selfAlign) m.push(`.frame(maxWidth: .infinity, alignment: ${horizontalAlignment(n.selfAlign)})`);
  // Fidelity rows already place every child by measured offset (layout.ts `geometry`).
  if (n.selfAlignV && ctx.mode === "app") m.push(`.frame(maxHeight: .infinity, alignment: ${verticalAlignment(n.selfAlignV)})`);
  if (st.hidden) m.push(".hidden()");
  // A `<label>` tap changes its checkbox or radio, anywhere in the label's box.
  const tap = n.labelFor !== undefined ? ctx.control.activate.get(n.labelFor) : undefined;
  if (tap) m.push(".contentShape(Rectangle())", `.onTapGesture { ${tap} }`);
  const a = n.a11y;
  if (a) {
    const container = n.kind === "stack" || n.kind === "grid";
    // A heading container reads as one element; a labelled one names its group.
    if (container && a.heading) m.push(".accessibilityElement(children: .combine)");
    else if (container && a.label) m.push(".accessibilityElement(children: .contain)");
    // A checkbox or radio is named by its `.accessibilityRepresentation` (controls.ts).
    const toggle = n.kind === "control" && (n.control === "toggle" || n.control === "radio");
    if (a.label && !toggle) m.push(`.accessibilityLabel(${str(a.label)})`);
    if (a.heading) m.push(".accessibilityAddTraits(.isHeader)", `.accessibilityHeading(.h${a.heading})`);
    if (a.trait) m.push(`.accessibilityAddTraits(.${a.trait})`);
    if (a.hidden) m.push(".accessibilityHidden(true)");
  }
  return m;
}
export function overlayModifier(o: Overlay, mode: "background" | "overlay", ctx: EmitContext): string[] {
  const inner = ctx.renderNode(o.node);
  // App mode keeps the corner CSS anchored; fidelity reproduces the capture from the top-left.
  const anchored = ctx.mode === "app" ? o.anchor : undefined;
  const [x, y] = anchored ? anchored.offset : o.offset;
  const body = o.covers ? inner : [...inner, `.offset(x: ${num(x)}, y: ${num(y)})`];
  return [`.${mode}(alignment: .${anchored ? anchored.corner : "topLeading"}) {`, ...indent(body, 1), `}`];
}
