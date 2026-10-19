import type { SemNode, Overlay, Presentation, StateField } from "../model/semantic.ts";
import type { EmitContext } from "./context.ts";
import {
  colorArgs,
  fontSizeExpr,
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
import { FIELDS, menuButton, menuExpr } from "./controls.ts";
import { animated, animationModifier, longestExit, stateAnimation, transitionModifiers } from "./motion.ts";
export function modifiers(n: SemNode, ctx: EmitContext): string[] {
  const generated: string[] = [];
  if (n.kind === "image" && n.generatedFont && n.generatedFont.size > 0 && ctx.mode === "app") {
    const scale = `(${fontSizeExpr(n.generatedFont, ctx)} / ${num(n.generatedFont.size)})`;
    generated.push(
      `.scaleEffect(${scale}, anchor: .topLeading)`,
      `.frame(width: ${num(n.frame.w)} * ${scale}, height: ${num(n.frame.h)} * ${scale}, alignment: .topLeading)`,
    );
  }
  return [...boxModifiers(n, ctx), ...generated, ...placementModifiers(n, ctx)];
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
  if (ctx.mode !== "app") return [];
  if (n.hitTesting === false) return [".allowsHitTesting(false)"];
  return [
    ...(n.hitRegionTarget ? [`.markswiftHitTarget(${str(n.hitRegionTarget)})`] : []),
    ...(n.hitRegionTargets
      ? [`.markswiftHitRegion(${str(n.id)}, targets: [${n.hitRegionTargets.map(str).join(", ")}])`]
      : []),
    ...(n.style.opacity === 0 && (n.action || n.kind === "control") ? [".contentShape(Rectangle())"] : []),
  ];
}

function decorated(n: SemNode, core: string[], ctx: EmitContext): string[] {
  // A menu trigger has no action member: its Button's label opens the native menu.
  const menu = n.kind !== "control" && n.action && !n.action.gesture && n.menu && !n.menu.context ? n.menu : undefined;
  const name = n.kind !== "control" && n.action ? ctx.control.actionOf.get(n.action.key) : undefined;
  if (!name && !menu) return [...core, ...modifiers(n, ctx)];
  // An ARIA toggle (`role=checkbox|switch|radio`), a layer's trigger or a presentation's closing button: the tap changes
  // the screen's state and acts.
  const tap = ctx.control.toggleOf.get(n)?.tap ?? ctx.control.openOf.get(n)?.tap ?? ctx.control.closeOf.get(n);
  if (n.action!.gesture)
    return [
      ...core,
      ...modifiers(n, ctx),
      ".contentShape(Rectangle())",
      `.onTapGesture { ${tap?.join("; ") ?? `${name}()`} }`,
    ];
  const press = ctx.control.pressOf.get(n);
  const label = [...core, ...boxModifiers(n, ctx), `.contentShape(${shapeExpr(n.style, n.frame.w, n.frame.h)})`];
  const style = `.buttonStyle(${press ? `MarkswiftPressStyle(isPressed: $${press})` : ".plain"})`;
  return [
    ...(menu
      ? menuButton(menu, label, style, ctx.control)
      : [
          ...(tap ? ["Button {", ...indent(tap, 1), "} label: {"] : [`Button(action: ${name}) {`]),
          ...indent(label, 1),
          "}",
          style,
        ]),
    ...(ctx.mode === "app" && n.a11y?.disabled ? [".disabled(true)"] : []),
    ...placementModifiers(n, ctx),
  ];
}

/**
 * The node's box: padding, frame, paint, borders, shadows, overlays, effects. A pressable control emits these inside its label, so they are its hit and press area.
 * A node with a pressed/focused look paints the union style of `pairStyle`, its colours as ternaries; app output
 * animates them with their CSS transitions: one `MarkswiftStateAnimation` at the end when every field shares its
 * timing, else one after each field's paint (the nearest one wins for what it wraps).
 * App: a scroll box's padding scrolls with its content (layout.ts); everything else here belongs to its ScrollView.
 */
export function boxModifiers(n: SemNode, ctx: EmitContext): string[] {
  const scrolls = ctx.mode === "app" && (n.kind === "stack" || n.kind === "grid") && n.scroll !== undefined;
  const paint = ctx.statePaint?.get(n.id);
  const timed = ctx.mode === "app" && paint?.transitions ? paint : undefined;
  const timings = new Map<StateField, string>(
    (timed?.fields ?? [])
      .filter((f) => f !== "transform" && f !== "filters")
      .map((f) => [f, stateAnimation(timed!.cond, timed!.transitions, f)]),
  );
  const uniform = new Set(timings.values()).size === 1 ? [...timings.values()][0] : undefined;
  const m: string[] = [];
  let last = -1;
  // After the lines drawing `field`; an identical timing just before is covered by this one.
  const animate = (field: StateField) => {
    const expr = timings.get(field);
    if (expr === undefined || uniform !== undefined) return;
    if (m[last] === expr) m.splice(last, 1);
    last = m.push(expr) - 1;
  };
  // Run colours paint the core Text this wraps.
  animate("runColors");
  if (!scrolls) m.push(...paddingModifiers(n, ctx));
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
  for (const o of [
    ...n.overlays.filter((o) => o.layer === "background" && !o.presentation && (!scrolls || o.fixed)),
  ].reverse())
    m.push(...overlayModifier(o, "background", ctx));
  // Inset shadows are part of the box paint: above fills, below every child.
  const inset = insetShadowModifiers(p, ctx);
  m.push(...inset);
  if (inset.length) animate("shadows");
  // Fills are bottom-most first in the IR; the same chain rule means the top-most goes first.
  // Unless a layer carries a `background-blend-mode`: blending is against the layers *below it
  // inside this node*, so the whole stack has to live in one compositing group instead of a
  // chain of independent `.background` modifiers.
  if (st.fills.some((f) => f.kind !== "unsupported" && f.blend))
    m.push(...blendedFillModifier(st.fills, p, shape, ctx));
  else for (const f of [...st.fills].reverse()) m.push(...fillModifier(f, p, shape, ctx));
  animate("fills");
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
  animate("border");
  animate("borderSides");
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
  animate("outline");
  const outer = outerShadowModifiers(p, ctx);
  m.push(...outer);
  if (outer.length) animate("shadows");
  for (const o of n.overlays.filter((o) => o.layer === "overlay" && !o.presentation && (!scrolls || o.fixed)))
    m.push(...overlayModifier(o, "overlay", ctx));
  m.push(...presentationModifiers(n, ctx));
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
  // An animated opacity is drawn by `MarkswiftAnimation` (placementModifiers), its static value as the base.
  const drivenOpacity = animated(n, ctx.mode) && n.motion!.base?.opacity !== undefined;
  if (drivenOpacity) {
    if (paint?.opacity) note(n, "approximated", ":active", "pressed opacity on an animated element is not reproduced");
  } else if (paint?.opacity && !nativeDim)
    m.push(`.opacity(${paint.cond} ? ${num(paint.opacity.state)} : ${num(paint.opacity.rest)})`);
  else if (st.opacity !== undefined && !nativeDim) m.push(`.opacity(${num(st.opacity)})`);
  animate("opacity");
  if (st.blur !== undefined) m.push(`.blur(radius: ${num(st.blur)})`);
  if (st.blend) {
    const mode = swiftBlend(st.blend);
    if (mode) m.push(`.blendMode(${mode})`);
  }
  if (uniform !== undefined) m.push(uniform);
  // Emit-time notes on the copy land in the shared diagnostics; carry the regrade back.
  if (p !== n) n.confidence = p.confidence;
  // CSS percentage width: paint inside the fraction; margins (`placementModifiers`) outside.
  if (ctx.mode === "app" && n.width.kind === "fraction")
    m.push(`.markswiftFraction(${num(n.width.fraction)}${n.width.right ? ", right: true" : ""})`);
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
  // Channels `MarkswiftAnimation` draws (pairs whole: analysis puts both axes in `base`).
  const driven = animated(n, ctx.mode) ? (n.motion!.base ?? {}) : {};
  if (st.transform) {
    const t = st.transform;
    if (t.skewX !== undefined || t.skewY !== undefined) m.push(affineModifier(t, n.frame.w, n.frame.h));
    else {
      const anchor = t.origin
        ? `UnitPoint(x: ${num(n.frame.w ? t.origin[0] / n.frame.w : 0.5)}, y: ${num(n.frame.h ? t.origin[1] / n.frame.h : 0.5)})`
        : ".center";
      if (driven.sx === undefined && scale) {
        const [[rx, ry], [sx, sy], c] = [scale.rest, scale.state, paint.cond];
        m.push(`.scaleEffect(x: ${c} ? ${num(sx)} : ${num(rx)}, y: ${c} ? ${num(sy)} : ${num(ry)}, anchor: ${anchor})`);
        if (ctx.mode === "app" && paint.transitions) m.push(stateAnimation(c, paint.transitions, "transform"));
      } else if (driven.sx === undefined && (t.scaleX !== 1 || t.scaleY !== 1))
        m.push(`.scaleEffect(x: ${num(t.scaleX)}, y: ${num(t.scaleY)}, anchor: ${anchor})`);
      if (t.rotate !== 0 && driven.deg === undefined)
        m.push(`.rotationEffect(.degrees(${num(t.rotate)}), anchor: ${anchor})`);
      if ((t.tx !== 0 || t.ty !== 0) && driven.tx === undefined) m.push(`.offset(x: ${num(t.tx)}, y: ${num(t.ty)})`);
    }
  }
  if (ctx.mode === "app" && st.transform?.responsive && driven.tx === undefined) {
    const { x, y } = st.transform.responsive;
    m.push(
      `.modifier(MarkswiftResponsiveTranslation(width: ${num(n.frame.w)}, height: ${num(n.frame.h)}, xWidth: ${num(x[0])}, xHeight: ${num(x[1])}, yWidth: ${num(y[0])}, yHeight: ${num(y[1])}))`,
    );
  }
  if (animated(n, ctx.mode)) m.push(animationModifier(n.motion!));
  else if ((n.motion?.animations || n.motion?.reduced) && ctx.mode === "fidelity")
    note(n, "approximated", "animation-name", "fidelity renders the settled look; app output animates");
  // CSS relative positioning moves paint, not layout: outside rotation/scale, which apply about the box's own origin.
  // A positioned box paints above its in-flow siblings, so an offset into a later sibling stays on top.
  // ponytail: a later sibling's own positioned descendants paint above it in CSS but below it here.
  if (n.relativeOffset) m.push(`.offset(x: ${num(n.relativeOffset[0])}, y: ${num(n.relativeOffset[1])})`, ".zIndex(1)");
  // A drawn presentation's trigger: what its content anchors to, and the long-press that opens a hover card.
  if (n.opens?.kind === "presentation") {
    if (n.opens.anchor) m.push(`.markswiftAnchor(${str(n.opens.layer)})`);
    const state = ctx.control.openStates.get(n.opens.layer);
    if (n.opens.longPress && state) m.push(`.simultaneousGesture(LongPressGesture().onEnded { _ in ${state} = true })`);
  }
  // A right-click menu: the trigger keeps its view; a long-press opens the native menu.
  if (n.menu?.context) m.push(".contextMenu {", ...indent(menuExpr(n.menu.items, ctx.control), 1), "}");
  // Where the browser's horizontal margins put the finished box inside its parent's content
  // box. After the paint, so the fills span the box the margins left, not the whole parent.
  if (n.selfAlign) m.push(`.frame(maxWidth: .infinity, alignment: ${horizontalAlignment(n.selfAlign)})`);
  // Fidelity rows already place every child by measured offset (layout.ts `geometry`).
  if (n.selfAlignV && ctx.mode === "app")
    m.push(`.frame(maxHeight: .infinity, alignment: ${verticalAlignment(n.selfAlignV)})`);
  if (n.colorScheme === "system") m.push(".modifier(MarkswiftRestoreColorScheme())");
  else if (n.colorScheme) m.push(`.environment(\\.colorScheme, .${n.colorScheme})`);
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
    // The disclosure style and select menu already announce their own state; never add a second value there.
    // A native menu announces its popup itself; a Radix select's value is its Picker's choice.
    const ownsValue =
      (n.kind === "control" && (n.control === "disclosure" || n.control === "picker")) ||
      (!!n.menu && !n.menu.context && (a.value === "expanded" || a.value === "collapsed"));
    const first = n.menu?.select ? n.menu.items[0] : undefined;
    const chosen = first && "id" in first ? ctx.control.menuState.get(first.id) : undefined;
    const opened = ctx.control.openOf.get(n);
    // `.accessibilityValue` replaces the "1"/"0" a toggle trait derives from `.isSelected`, so it spells them out.
    if (state?.mixed) m.push(`.accessibilityValue(${state.mixed} ? "mixed" : ${state.on} ? "1" : "0")`);
    // `aria-expanded` of a trigger whose layer the screen shows follows that state (only where the design states it).
    else if (opened && (a.value === "expanded" || a.value === "collapsed"))
      m.push(`.accessibilityValue(${opened.state} ? "expanded" : "collapsed")`);
    else if (chosen) m.push(`.accessibilityValue(${chosen})`);
    else if (a.value && !ownsValue) m.push(`.accessibilityValue(${str(a.value)})`);
    if (a.hint) m.push(`.accessibilityHint(${str(a.hint)})`);
    if (a.hidden) m.push(".accessibilityHidden(true)");
  }
  // A pointer shows `.help` (iPad, Mac); VoiceOver reads the hint. An author `aria-describedby` hint wins.
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
  const marker = ctx.mode === "app" && o.outsideMarker;
  if (marker) inner.push(".alignmentGuide(.leading) { $0[.trailing] }");
  const [x, y] = anchored ? anchored.offset : marker ? [o.offset[0] + o.node.frame.w, o.offset[1]] : o.offset;
  const body = o.covers ? inner : [...inner, `.offset(x: ${num(x)}, y: ${num(y)})`];
  return [`.${mode}(alignment: .${anchored ? anchored.corner : "topLeading"}) {`, ...indent(body, 1), `}`];
}

/**
 * One `.markswiftPresentation` per drawn presentation on `n`, its roots in overlay order: a native
 * `::backdrop` colour, then each root as one expression (`transitionModifiers` appends to it). Roots `layers.ts` made
 * pass-through (a scrim) draw where they are; the first content root takes the presentation's placement, any later
 * one its captured offset.
 */
function presentationModifiers(n: SemNode, ctx: EmitContext): string[] {
  const roots = new Map<Presentation, Overlay[]>();
  for (const o of n.overlays) if (o.presentation) roots.set(o.presentation, [...(roots.get(o.presentation) ?? []), o]);
  const size = ([w, h]: [number, number]) => `CGSize(width: ${num(w)}, height: ${num(h)})`;
  return [...roots].flatMap(([p, overlays]) => {
    const state = ctx.control.openStates.get(p.id);
    if (!state) return [];
    const first = overlays.find((o) => o.node.hitTesting !== false);
    const at = p.placement;
    const placed =
      at.kind === "center"
        ? ".center"
        : at.kind === "edge"
          ? `.edge(.${at.edge})`
          : at.kind === "anchored"
            ? `.anchored(${str(p.id)}, from: ${unitPoint(at.from)}, to: ${unitPoint(at.to)}, gap: ${size(at.gap)})`
            : undefined;
    // Each root leaves with its own exit; Escape and outside taps close inside the longest one.
    const body = overlays.flatMap((o) => {
      const view = ctx.renderNode(o.node);
      if (o.node.hitTesting === false)
        return [
          ...(o.covers ? view : [...view, `.offset(x: ${num(o.offset[0])}, y: ${num(o.offset[1])})`]),
          ...transitionModifiers(o.node),
        ];
      return [
        ...view,
        `.markswiftPlaced(${(o === first && placed) || `.offset(${size(o.offset)})`})`,
        ...transitionModifiers(o.node),
      ];
    });
    const d = p.dismiss;
    const exit = longestExit(overlays.map((o) => o.node));
    const backdropExit = first && longestExit([first.node]);
    return [
      `.markswiftPresentation(isPresented: $${state}, modal: ${p.modal}, dismissOnEscape: ${d.escape}, dismissOnOutside: ${d.outside}${exit ? `, exit: ${exit}` : ""}, onDismiss: ${ctx.control.dismissedOf.get(p.id) ?? "{}"}) {`,
      ...indent(
        [
          ...(p.backdrop
            ? [
                `Color.markswift(${colorArgs(p.backdrop)})`,
                ".allowsHitTesting(false)",
                ...(backdropExit ? [`.transition(.opacity.animation(${backdropExit}))`] : []),
              ]
            : []),
          ...body,
        ],
        1,
      ),
      "}",
    ];
  });
}

const unitPoint = ([x, y]: [number, number]) => `UnitPoint(x: ${x.toFixed(1)}, y: ${y.toFixed(1)})`;
