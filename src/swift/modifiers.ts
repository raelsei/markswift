import type { SemNode, Overlay } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import {
  colorArgs,
  colorExpr,
  edgeInsets,
  horizontalAlignment,
  indent,
  num,
  str,
  strokeStyle,
  verticalAlignment,
} from "./format.ts";
import { floorOverflow, frameModifier, surplusFloor } from "./frames.ts";
import { shapeExpr, fillModifier, blendedFillModifier, swiftBlend } from "./paint.ts";
import { borderSideModifiers } from "./borders.ts";
import { affineModifier, filterModifier, clipPathModifier, maskModifier } from "./effects.ts";
import { note } from "./diagnostics.ts";
import { insetShadowModifiers, outerShadowModifiers } from "./shadows.ts";
import { FIELDS } from "./controls.ts";
export function modifiers(n: SemNode, ctx: EmitContext): string[] {
  return [...boxModifiers(n, ctx), ...placementModifiers(n, ctx)];
}

/**
 * A node's view: its core lines plus modifiers. An element the design made activatable
 * (`SemBase.action` on a non-control) becomes a Button whose label is the painted box — the box is
 * the hit and press area — with placement and accessibility outside, like a native button. One that
 * contains another control keeps its view and gains a tap gesture instead.
 */
export function decorate(n: SemNode, core: string[], ctx: EmitContext): string[] {
  return [...decorated(n, core, ctx), ...hitTestingModifier(n, ctx)];
}

/** App: a pass-through overlay (`pointer-events: none`), after the Button/tap gesture, so nothing inside answers a tap. */
export function hitTestingModifier(n: SemNode, ctx: EmitContext): string[] {
  return ctx.mode === "app" && n.hitTesting === false ? [".allowsHitTesting(false)"] : [];
}

function decorated(n: SemNode, core: string[], ctx: EmitContext): string[] {
  const name = n.kind !== "control" && n.action ? ctx.control.actionOf.get(n.action.key) : undefined;
  if (!name) return [...core, ...modifiers(n, ctx)];
  // An ARIA toggle (`role=checkbox|switch|radio`) or an in-flow layer's trigger: the tap changes the screen's state, then acts.
  const tap = ctx.control.toggleOf.get(n)?.tap ?? ctx.control.openOf.get(n)?.tap;
  if (n.action!.gesture)
    return [
      ...core,
      ...modifiers(n, ctx),
      ".contentShape(Rectangle())",
      `.onTapGesture { ${tap?.join("; ") ?? `${name}()`} }`,
    ];
  const press = ctx.control.pressOf.get(n);
  return [
    ...(tap ? ["Button {", ...indent(tap, 1), "} label: {"] : [`Button(action: ${name}) {`]),
    ...indent([...core, ...boxModifiers(n, ctx), `.contentShape(${shapeExpr(n.style, n.frame.w, n.frame.h)})`], 1),
    "}",
    `.buttonStyle(${press ? `MarkswiftPressStyle(isPressed: $${press})` : ".plain"})`,
    ...(ctx.mode === "app" && n.a11y?.disabled ? [".disabled(true)"] : []),
    ...placementModifiers(n, ctx),
  ];
}

/**
 * The node's box: padding, frame, paint, borders, shadows, overlays, effects. A pressable control emits these inside its label, so they are its hit and press area.
 * A node with a pressed/focused look paints the union style of `pairStyle`, its colours as ternaries.
 * App: a scroll box's padding scrolls with its content (layout.ts); everything else here belongs to its ScrollView.
 */
export function boxModifiers(n: SemNode, ctx: EmitContext): string[] {
  const scrolls = ctx.mode === "app" && (n.kind === "stack" || n.kind === "grid") && n.scroll !== undefined;
  const m = scrolls ? [] : paddingModifiers(n, ctx);
  const paint = ctx.statePaint?.get(n.id);
  // A copy for the paint helpers; `frameModifier` and the overlays keep `n` (identity lookups).
  const p = paint ? ({ ...n, style: paint.style } as SemNode) : n;
  const st = p.style;
  m.push(...frameModifier(n, ctx));
  // `object-fit: cover` overflows its box and `none` can; the browser clips both to the img box.
  if (n.kind === "image" && (n.contentMode === "cover" || n.contentMode === "none") && !st.clip) m.push(".clipped()");
  const shape = shapeExpr(st, n.frame.w, n.frame.h);
  // Decorative absolutely-positioned children behind the content. `.background(A).background(B)`
  // puts B behind A, so apply the front-most background first. A ScrollView keeps only `position: fixed`
  // overlays; the rest scroll with its content (layout.ts).
  for (const o of [...n.overlays.filter((o) => o.layer === "background" && (!scrolls || o.fixed))].reverse())
    m.push(...overlayModifier(o, "background", ctx));
  // Inset shadows are part of the box paint: above fills, below every child.
  m.push(...insetShadowModifiers(p, ctx));
  // Fills are bottom-most first in the IR; the same chain rule means the top-most goes first.
  // Unless a layer carries a `background-blend-mode`: blending is against the layers *below it
  // inside this node*, so the whole stack has to live in one compositing group instead of a
  // chain of independent `.background` modifiers.
  if (st.fills.some((f) => f.kind !== "unsupported" && f.blend))
    m.push(...blendedFillModifier(st.fills, p, shape, ctx));
  else for (const f of [...st.fills].reverse()) m.push(...fillModifier(f, p, shape, ctx));
  // backdrop-filter: over the flat canvases these designs use, blurring the backdrop changes
  // nothing visible, while SwiftUI materials add their own tint (badly in dark mode). The
  // translucent fill above already carries the "glass" look; keep the node flagged approximated.
  // A scroll box clips its content to its rounded padding box, as `overflow: auto` does.
  if (st.clip || (st.radius && (n.kind === "stack" || n.kind === "grid") && (n.overlays.length || scrolls)))
    m.push(`.clipShape(${shape})`);
  if (st.border) {
    const b = st.border;
    m.push(
      b.dashed
        ? `.overlay(${shape}.strokeBorder(${colorExpr(b.color, ctx, n.id)}, style: ${strokeStyle(b.width, "dashed")}))`
        : `.overlay(${shape}.strokeBorder(${colorExpr(b.color, ctx, n.id)}, lineWidth: ${num(b.width)}))`,
    );
  } else if (st.borderSides) m.push(...borderSideModifiers(p, ctx));
  // A ring the rest leaves transparent still draws when the state paints it.
  if (
    st.outline &&
    st.outline.width > 0 &&
    (st.outline.color.a > 0 || paint?.colors.has(colorArgs(st.outline.color)))
  ) {
    // A ring `offset` outside the border edge: the box shape grown by offset + half the stroke.
    const o = st.outline;
    if (o.style === "double") note(n, "approximated", "outline-style", "outline-style double drawn solid");
    m.push(
      `.overlay(${shape}.inset(by: ${num(-(o.offset + o.width / 2))}).stroke(${colorExpr(o.color, ctx, n.id)}, style: ${strokeStyle(o.width, o.style)}))`,
    );
  }
  m.push(...outerShadowModifiers(p, ctx));
  for (const o of n.overlays.filter((o) => o.layer === "overlay" && (!scrolls || o.fixed)))
    m.push(...overlayModifier(o, "overlay", ctx));
  // CSS effect order: filter → clip-path → mask → opacity.
  if (st.filters) for (const f of st.filters) m.push(...filterModifier(f, p, ctx));
  if (st.clipPath) m.push(clipPathModifier(st.clipPath, p, ctx));
  if (st.mask) m.push(...maskModifier(st.mask, p, ctx));
  // A disabled control's dimming is expressed twice over: the design's own `:disabled` opacity
  // and SwiftUI's automatic dimming from `.disabled(true)`. App mode keeps the native one (a
  // live control must dim the way the platform dims); fidelity keeps the design's number and
  // omits `.disabled` entirely, since nothing interacts with a rendered image. `aria-disabled` on an
  // element emitted as a Button dims the same way. SwiftUI does not dim a text field or editor
  // whose text has its own colour, so those keep the design's opacity in app mode too.
  const nativeDim =
    ctx.mode === "app" &&
    ((n.kind === "control" && n.disabled === true && !FIELDS[n.control]) ||
      (!!n.action && !n.action.gesture && n.a11y?.disabled === true));
  if (paint?.opacity && !nativeDim)
    m.push(`.opacity(${paint.cond} ? ${num(paint.opacity.state)} : ${num(paint.opacity.rest)})`);
  else if (st.opacity !== undefined && !nativeDim) m.push(`.opacity(${num(st.opacity)})`);
  if (st.blur !== undefined) m.push(`.blur(radius: ${num(st.blur)})`);
  if (st.blend) {
    const mode = swiftBlend(st.blend);
    if (mode) m.push(`.blendMode(${mode})`);
  }
  // Emit-time notes on the copy land in the shared diagnostics; carry the regrade back.
  if (p !== n) n.confidence = p.confidence;
  // CSS percentage width: paint inside the fraction; margins (`placementModifiers`) outside.
  if (ctx.mode === "app" && n.width.kind === "fraction") m.push(`.markswiftFraction(${num(n.width.fraction)})`);
  return m;
}

/** The box's padding. App: a padded line-box surplus is a `minHeight` floor instead (`surplusFloor`); content CSS let
 * overflow the floored box gives its overflow back (`floorOverflow`). */
export function paddingModifiers(n: SemNode, ctx: EmitContext): string[] {
  const surplus = surplusFloor(n, ctx);
  const [overTop, overBottom] = floorOverflow(n, ctx);
  const padding: [number, number, number, number] = [
    n.padding[0] - overTop,
    n.padding[1],
    n.padding[2] - overBottom,
    n.padding[3],
  ];
  if (surplus) padding[surplus.edge === "top" ? 0 : 2] -= surplus.px;
  const [pt, pr, pb, pl] = padding;
  if (!pt && !pr && !pb && !pl) return [];
  return [pt === pr && pr === pb && pb === pl ? `.padding(${num(pt)})` : `.padding(${edgeInsets(padding)})`];
}

/**
 * Where the finished box sits and what it is: transform, self-alignment, visibility, a `<label>`'s
 * tap, accessibility. Nothing that paints or sizes the box: a button's box modifiers go inside its
 * label, and these stay outside it.
 */
export function placementModifiers(n: SemNode, ctx: EmitContext): string[] {
  const m: string[] = [];
  const paint = ctx.statePaint?.get(n.id);
  const st = paint?.style ?? n.style;
  const scale = paint?.scale;
  if (st.transform) {
    const t = st.transform;
    if (t.skewX !== undefined || t.skewY !== undefined) m.push(affineModifier(t, n.frame.w, n.frame.h));
    else {
      const anchor = t.origin
        ? `UnitPoint(x: ${num(n.frame.w ? t.origin[0] / n.frame.w : 0.5)}, y: ${num(n.frame.h ? t.origin[1] / n.frame.h : 0.5)})`
        : ".center";
      if (scale) {
        const [[rx, ry], [sx, sy], c] = [scale.rest, scale.state, paint.cond];
        m.push(`.scaleEffect(x: ${c} ? ${num(sx)} : ${num(rx)}, y: ${c} ? ${num(sy)} : ${num(ry)}, anchor: ${anchor})`);
      } else if (t.scaleX !== 1 || t.scaleY !== 1)
        m.push(`.scaleEffect(x: ${num(t.scaleX)}, y: ${num(t.scaleY)}, anchor: ${anchor})`);
      if (t.rotate !== 0) m.push(`.rotationEffect(.degrees(${num(t.rotate)}), anchor: ${anchor})`);
      if (t.tx !== 0 || t.ty !== 0) m.push(`.offset(x: ${num(t.tx)}, y: ${num(t.ty)})`);
    }
  }
  // CSS relative positioning moves paint, not layout: outside rotation/scale, which apply about the box's own origin.
  // A positioned box paints above its in-flow siblings, so an offset into a later sibling stays on top.
  // ponytail: a later sibling's own positioned descendants paint above it in CSS but below it here.
  if (n.relativeOffset) m.push(`.offset(x: ${num(n.relativeOffset[0])}, y: ${num(n.relativeOffset[1])})`, ".zIndex(1)");
  // Where the browser's horizontal margins put the finished box inside its parent's content
  // box. After the paint, so the fills span the box the margins left, not the whole parent.
  if (n.selfAlign) m.push(`.frame(maxWidth: .infinity, alignment: ${horizontalAlignment(n.selfAlign)})`);
  // Fidelity rows already place every child by measured offset (layout.ts `geometry`).
  if (n.selfAlignV && ctx.mode === "app")
    m.push(`.frame(maxHeight: .infinity, alignment: ${verticalAlignment(n.selfAlignV)})`);
  if (st.hidden) m.push(".hidden()");
  // A `<label>` tap changes its checkbox or radio, or focuses its text field, anywhere in the label's box.
  const tap = n.labelFor !== undefined ? ctx.control.activate.get(n.labelFor) : undefined;
  if (tap) m.push(".contentShape(Rectangle())", `.onTapGesture { ${tap} }`);
  const a = n.a11y;
  if (a) {
    const container = n.kind === "stack" || n.kind === "grid" || a.container;
    // A heading container reads as one element; a labelled one names its group.
    if (container && a.heading) m.push(".accessibilityElement(children: .combine)");
    else if (container && a.label) m.push(".accessibilityElement(children: .contain)");
    // A checkbox or radio is named by its `.accessibilityRepresentation` (controls.ts).
    const toggle = n.kind === "control" && (n.control === "toggle" || n.control === "radio");
    if (a.label && !toggle) m.push(`.accessibilityLabel(${str(a.label)})`);
    if (a.heading) m.push(".accessibilityAddTraits(.isHeader)", `.accessibilityHeading(.h${a.heading})`);
    if (a.trait) m.push(`.accessibilityAddTraits(.${a.trait})`);
    // A link-like Button (role=link) announces a link, not a button.
    if (a.trait === "isLink" && n.action && !n.action.gesture) m.push(".accessibilityRemoveTraits(.isButton)");
    if (a.toggle) m.push(".accessibilityAddTraits(.isToggle)");
    // An ARIA toggle's checked state is the screen's (`controlMembers`), so the trait and `mixed` follow it.
    const state = ctx.control.toggleOf.get(n);
    if (state) m.push(`.accessibilityAddTraits(${state.on} ? .isSelected : [])`);
    else if (a.selected) m.push(".accessibilityAddTraits(.isSelected)");
    // Plan 025's disclosure style and select menu already announce their own state; never add a second value there.
    const ownsValue = n.kind === "control" && (n.control === "disclosure" || n.control === "picker");
    const opened = ctx.control.openOf.get(n);
    // `.accessibilityValue` replaces the "1"/"0" a toggle trait derives from `.isSelected`, so it spells them out.
    if (state?.mixed) m.push(`.accessibilityValue(${state.mixed} ? "mixed" : ${state.on} ? "1" : "0")`);
    // `aria-expanded` of a trigger whose layer the screen shows follows that state.
    else if (opened) m.push(`.accessibilityValue(${opened.state} ? "expanded" : "collapsed")`);
    else if (a.value && !ownsValue) m.push(`.accessibilityValue(${str(a.value)})`);
    if (a.hint) m.push(`.accessibilityHint(${str(a.hint)})`);
    if (a.hidden) m.push(".accessibilityHidden(true)");
  }
  // D-HOVER: a pointer shows `.help` (iPad, Mac); VoiceOver reads the hint. An author `aria-describedby` hint wins.
  if (n.tooltip) {
    m.push(`.help(${str(n.tooltip)})`);
    if (!a?.hint) m.push(`.accessibilityHint(${str(n.tooltip)})`);
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
