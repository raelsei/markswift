# Changelog

All notable changes to Markswift. Versions follow SemVer; the package is published to npm as `markswift`.
A LayoutDoc schema change is a major version.

## [Unreleased]

## [3.0.0] — 2026-10-20

### Changed (breaking)

- LayoutDoc 5 records responsive transform geometry, measured relative offsets, font-face stretch ranges and resolved
  monospace faces. LayoutDoc 4 captures are rejected with a recapture instruction. LayoutDoc 5 is frozen with this release.
- Regenerate every view and its shared runtime together; generated runtime interfaces have changed.

### Fixed

- Percentage-width blocks align correctly in RTL, and bare text splits around floats without losing words.
- Percentage 2D translations and SVG cover/contain sizing follow the rendered box in app mode. Relative offsets
  resolve against percentage-height and stretched containers; inline and pseudo-element offsets preserve text flow.
- Nested overlays replay ancestor triggers, native menus retain submenus, repeated rows retain independent actions,
  supported dialog widths resize, and breakpoint captures select their own layers.
- Exact available system-font axes, distinct webfont width faces and Chrome-resolved monospace fonts are retained.
  Fractional text line boxes, variable font weights and native field heights preserve their captured metrics.
- Plain ASCII multiline paragraphs with packaged font metrics use greedy UIKit wrapping on iOS 26+, with accessibility and Dynamic Type.
  System-font fallbacks, rich text, other scripts, older iOS and macOS retain the SwiftUI path.
- Nested colour schemes, paragraph/marker bidi isolation and pointer-enabled children of pass-through overlays work.
  Transparent controls retain pointer actions independently of accessibility visibility.
- Generated images scale with Dynamic Type; uneven counter widths no longer prevent repeated-list extraction.
- Native iOS tables expose row/column positions, spans and header associations while retaining interactive controls.
  Column-group scope and native two-dimensional macOS table navigation remain unsupported.
- Captures have bounded, contextual timeout diagnostics. Browser rejection tests await their errors, and performance
  tests use three-sample medians without relaxing the budgets.
- The documentation site loads CSS, scripts and navigation from the custom domain root.

### Validation and publishing

- iPad breakpoint reflow is gated against a tracked baseline; native Menu pressed appearance has a live UI check.
- Publishing verifies the registry version, distribution tag and installed CLI in a clean directory.
- Six component app captures remain documented visual exceptions (four fields and two dark cards); existing
  accessibility audit exceptions and unsupported CSS/interaction boundaries remain documented in README.
- The post-release roadmap in #16 is outside this release.

### Migrating from 2.x

1. Upgrade `markswift` to 3.0.0. Saved LayoutDoc 4 files cannot be relabelled: recapture their HTML/CSS source.
2. Rerun `markswift convert ... --update` or `markswift build ...` to regenerate all views and their shared runtime.
   Keep custom code in caller-owned files; review generated initializer changes for repeated overlays and menus.
3. Rebuild the Swift target and verify application callbacks. iOS 18+ remains supported; greedy paragraph wrapping
   uses UIKit on iOS 26+ and falls back to SwiftUI on earlier systems.

## [2.0.0] — 2026-10-18

Breakpoints, overlays and motion, on LayoutDoc 4. `--breakpoints` captures every CSS width band and emits one view
that switches at the CSS thresholds on the width SwiftUI offers it (width container queries too). Dialogs, sheets,
popovers, hover cards, disclosures and menus opened by a trigger are captured automatically and emitted with
init-seeded state: drawn with their CSS look, menus as native popups, tooltips as `.help`. CSS keyframe animations,
pressed/focused transitions, overlay enter/exit and disclosure height animate with their CSS timing and honour Reduce
Motion. LayoutDoc 4 also brings grid placement and spans, native tables, relative offsets, the placeholder colour,
generated images and counter markers, `unicode-bidi`, variable-font axes, `color-scheme`, `pointer-events`,
`fill-rule` and `empty-cells`. LayoutDoc 4 is frozen with this release; saved 1.x captures must be recaptured (see
[the migration steps](#migrating-from-1x) below).

### Added
- App-mode grids keep CSS placement: `grid-column`/`grid-row` lines and spans, named areas, holes, explicit and implicit (`grid-auto-rows`) auto/px rows with CSS's row-span distribution, `justify-self`/`justify-items`, and a single implicit `auto` column now lay out through `MarkswiftTracks` (`.markswiftGridCell`) when the solvers reproduce the capture within 1 px; shadcn CardHeader actions and Alert icons reflow instead of pinning their cells.
- Placeholders paint in the page's `::placeholder` colour (its `-webkit-text-fill-color`, faded by `opacity`): the `TextField`/`SecureField` `prompt:` and the `TextEditor` placeholder overlay in app mode, the painted placeholder in fidelity; a colour that differs in dark becomes an adaptive token. Chrome's default grey keeps the platform placeholder grey (output unchanged); `::placeholder` font style and weight are not drawn. Needs LayoutDoc 4.
- `position: relative` offsets are drawn with `.offset(x:y:)` from the authored insets (px, `%`, `calc`, rtl), and the box keeps its flow slot, so siblings no longer shift (irregular stack gaps and `children overlap` reports are gone). Percentage offsets are pins at the captured width and are reported; `position: sticky` stays at its rest position.
- CSS `@keyframes` animations play in app output (opacity, translate, scale, rotate) with exact CSS timing and easing through `MarkswiftAnimation`; Reduce Motion follows the author's `prefers-reduced-motion` rules, else stops decorative loops and removes movement from one-shots (their opacity keeps its timing; status spinners keep turning). Frame captures `@t:<ms>` gate them. Unmapped animations (scroll-driven, `animation-composition`, keyframed colours/backgrounds/stroke, skew and 3D transforms) are reported per node; fidelity output keeps the settled look.
- Pressed/focused looks animate with their CSS `transition` timing per direction (`MarkswiftStateAnimation`); `steps()`/`linear()` timing via `MarkswiftEasing`; Reduce Motion drops movement.
- `title` and captured tooltips (Radix/shadcn tooltip, `interestfor`) become `.help(…)` and an accessibility hint.
- App mode: dialogs, alert dialogs, sheets, popovers and hover cards opened by a captured trigger are drawn with their CSS look while an init-seeded `is<Name>Presented` is true; Escape, an outside tap or the design's own buttons close them (`on<Name>Dismissed`), modal ones are VoiceOver-modal, hover cards open on long-press.
- App mode: Radix/shadcn dropdown menus, context menus, menubars and selects open native `Menu`/`.contextMenu` popups with their captured items (buttons, checkbox and radio items, separators, labelled groups); the trigger keeps its CSS look. A select's trigger shows its Picker's choice. A menu trigger loses its own `on<Name>` parameter; shortcut text, item icons and submenu items are not translated (a submenu is a disabled entry).
- Drawn overlays play their CSS enter/exit animations; accordion, collapsible and `<details>` content grows with its CSS height animation (`MarkswiftReveal`).
- `markswift convert --breakpoints` (API `breakpoints`): one view across CSS width bands. Elements whose authored inputs differ between bands become alternatives chosen at layout time by `MarkswiftBands` at the width offered to the view (no first-frame flash); everything else is emitted once and reflows natively. One `@State` per control across bands; a fixed-width root or script-driven DOM differences are reported.
- Generated images inside text: a `data:` image of an inline `::before`/`::after`/`::marker` (`content: url()`, an inside `list-style-image`) rides in the paragraph as `Text(Image.markswiftRendered(…) { … })` at its CSS size on the baseline (`vertical-align` shifts it) in its inline box's font (so its line keeps the CSS height on iOS, whose default `.body` is taller), instead of breaking out below the text; outside `list-style-image` markers hang as image overlays. A `url()` the browser did not lay out is reported (`approximated content`/`list-style-image`), an inline source without pixels keeps its advance (`unmapped content: url()`).
- Extracted rows derive counter markers (`decimal`, `decimal-leading-zero`, alphabetic/latin, roman `::marker`s and `content: counter()`) from the row index through `markswiftCounter(_:_:)` when the captured values form an arithmetic progression (start, `reversed`, step); unextracted output is unchanged.
- Native tables: admitted tables (separated or collapsed, colspan/rowspan, `border-spacing`, `table-layout: fixed` from `<col>`/first-row widths) are laid out by the runtime `MarkswiftTable` with shared columns; `<th>` announces as a header.
- `markswift build`: `breakpoints` in `markswift.json` (shared or per component) builds breakpoint views into the package; band tokens join the library `Palette`.
- Breakpoint views name band alternatives after the CSS breakpoint (`v_split_md`, Tailwind `sm`…`2xl`, else `w<px>`) and add one preview per band.
- Visual gate: breakpoint fixtures are scored at every band width and at T−1/T of each threshold for the merged view (`…@bp` captures, `breakpointMaxLoss` 0.01 / `reflowMaxLoss` 0.03); the iOS renderer uses an iPad simulator, rotated to landscape, for wide captures; the behaviour harness switches bands and checks that text and toggles keep their values.
- `--breakpoints` reconstructs width `@container` queries: a query container (`container-type`) that is a stack or grid nests `MarkswiftBands` and switches its content at the width SwiftUI offers its content box; when the page has container queries the planner adds one capture at the top of each band, then captures each band past the first at its lower bound (its device becomes one more capture), so a container that crosses its query just above a media breakpoint switches there too.
- LayoutDoc 4 records the page's size conditions (`conditions`: `@media`/`@container` query, whether it holds, the query container) and marks the elements their rules match (`conditional`). `convert({ breakpoints })` captures one layout per CSS width band (devices 390/834/1210/1376 px up to 1376 px; uncovered bands at their lower bound) and returns them as `bands`.
- Capture: open-state pass — each discovered trigger is opened in a fresh page; LayoutDoc 4 records `layers` (new content, placement, modality, dismissal), the trigger's `states.open` paint and `pseudoStyles.backdrop`.
- App mode: a closed `<details>`, collapsible or accordion item gets its content behind an init-seeded `is<Name>Expanded` state; the trigger toggles it and announces expanded/collapsed; `#Preview` shows it open. `CompileResult.openStates` maps each such layer to its `init` label; the pilot adds `@open:<layer>` captures.
- An author `unicode-bidi` (`embed`, `isolate`, `bidi-override`, `isolate-override`, `plaintext`) on inline elements maps to Unicode bidi controls from the captured computed value; `<bdo>`/`<bdi>`/`[dir]` now come from the same value.
- `font-variation-settings`, `font-stretch` and `font-optical-sizing` are read: `wght`/`opsz` set the weight and optical size, other axes a bundled variable font declares (incl. `wdth` from `font-stretch`) render exactly through `.markswiftVariable(…, axes:)` in both modes (app keeps Dynamic Type), `font-optical-sizing: none` drops the automatic `opsz`; on system fonts `font-stretch` approximates to SF's nearest width (`.width(Font.Width(…))`, reported).
- A root `color-scheme` that names one scheme (`dark`, `dark only`, `light`, `light only`) forces the view's appearance with `.environment(\.colorScheme, …)` in both modes; an adaptive conversion does so only when both captures agree.
- `pointer-events: none` overlays pass taps through (`.allowsHitTesting(false)`, app mode).
- `empty-cells: hide` on separated tables: a cell holding only collapsible whitespace paints no background, border or shadow.

### Changed (breaking)
- LayoutDoc 4: saved LayoutDoc 3 captures (1.x `layout.json`) are rejected by `compileLayout` with an error naming both versions; recapture the source. LayoutDoc 4 records 26 more computed properties (grid placement, table spacing and layout, `content`, list-style image/type, `pointer-events`, `fill-rule`, `empty-cells`, `color-scheme`, `unicode-bidi`, variable-font axes, container and top-layer properties), the `::placeholder` style of text fields, and a required `viewport` and `conditions` list. Two values change meaning: `preferredSize.insets` is now also recorded for `position: relative` and `sticky`, and `::before`/`::after`/`::marker` nodes gain an `img` child per image the browser drew from `content: url()` or `list-style-image`. A relatively positioned box's `bounds` is its in-flow box (the layout snapshot cancels the offset, like transforms). A multi-part pseudo `content` (`counter(n) ". " attr(x)`) is captured whole: consecutive text parts merge into one `#text` child (LayoutDoc 3 kept only the last). Further LayoutDoc 4 fields: `conditional` (the size conditions an element's rules match), `layers`, `states.open` and `pseudoStyles.backdrop` (open-state capture) and `LayoutNode.motion` (animations and transitions). LayoutDoc 4 is frozen from 2.0.0 (enforced by `tests/architecture/layout-doc.test.ts`): a schema change is LayoutDoc 5 and Markswift 3.0.
- Extracted ordered-list rows derive their marker from the row index: the marker string field is gone from the row type and the row subview takes `ordinal: Int`.
- A menu trigger (dropdown menu, context menu, menubar, select) no longer has its own `on<Name>` action parameter: its items' actions replace it.

### Changed
- `ConversionWarning.source` may be `breakpoints`.
- Generated Swift for admitted tables is one `MarkswiftTable` of flat cells (rows no longer extract into `ForEach` row components); a table caption sits outside the table's padding, and caption margins are respected.
- LayoutDoc 4: `LayoutNode.motion` records CSS animations (both `prefers-reduced-motion` branches) and pressed/focused transitions (per direction) from Chrome's Web Animations objects; capture warns about script animations and `@starting-style`.
- A `::before`/`::after`/`::marker` image drawn as its own image is decorative unless `content` names an alternative text (`url(…) / "Info"`).
- Pages with dialogs, popovers, sheets, hover cards or disclosures gain state (`is<Name>Presented`/`is<Name>Expanded`, defaulting to `false` in `init`) and `on<Name>Dismissed` actions; a `prepare` hook also runs before each open-state capture page (about 0.3 s per trigger and theme, at most 12 triggers).

### Fixed
- A stylesheet `fill-rule: evenodd` on SVG shapes is honoured (only the attribute was read).
- Screenshots of a page with an indeterminate `<progress>` are deterministic: Chrome animates the bar from its clock (not a CSS animation), so each capture caught a different frame; the capture now paints it at its first frame (bar at the start of the track).


### Known limitations
- Not translated: JavaScript behaviour and business logic; height and orientation media queries (reported; landscape is a wider width band); height, style and scroll-state container queries (reported); states other than pressed, focused and open (hover-only states other than tooltips and hover cards, disabled, validation, checked, `data-state` variants); swipe-to-dismiss and system presentation chrome, collision flip, scroll lock and focus trap beyond VoiceOver's modal containment (overlays are placed as captured at the primary viewport); the CSS look of open menus, shortcut text, item icons and submenus (a submenu is a disabled entry); tooltips are never drawn (`.help` and a VoiceOver hint); scroll-driven animations, keyframed colours/shadows/filters/layout properties, `@starting-style` and script animations (reported); sticky pinning while scrolling; `<select multiple>`, `<datalist>`; inline handlers inside running text; `ui-monospace` maps to a different native face.
- Author `prefers-reduced-motion` rules for overlay enter/exit are not captured (the default Reduce Motion fallback applies; a capture warning names them).
- Pinned geometry (reported per node): grids outside the `MarkswiftTracks` subset (overlapping items, template line names, implicit columns, column or dense flow, right-to-left), tables outside the `MarkswiftTable` subset, auto-layout tables (captured column widths scale; CSS min-/max-content sizing is not reproduced), percentage relative offsets, flex-wrap and unequal flex growth outside their solvers, inline-block rows.
- Known gaps: a paragraph's own `unicode-bidi: plaintext` and marker bidi isolation are not mapped; `color-scheme` is read on the root only; on system fonts `font-stretch` snaps to SF's nearest width and other axes are dropped; the `@font-face` `font-stretch` descriptor does not select faces; a `pointer-events: none` overlay with a `pointer-events: auto` descendant stays hittable as a whole; `%` top/bottom relative offsets need a px-height containing block, inline-run and pseudo-element offsets are not drawn; generated images do not scale with Dynamic Type and outside markers of differing widths keep lists unrolled; VoiceOver table navigation (row/column position, header association) is not translated; bare text beside a float is not split; a `width: %` block in a `dir=rtl` parent is drawn at the left edge; at other widths a `%` `translateX` stays pinned and an `object-fit: cover` image does not refill its box; triggers inside an open layer are not opened; a trigger in a repeated row blocks its `ForEach`; dialog content keeps its captured width; with `--breakpoints` layers come from the primary capture and apply in every band.
- Visual gate: 13 of the 198 `components@app` iOS captures are listed exceptions (fractional line boxes rounded to the pixel grid, iOS native line breaking that avoids a one-word last line, `ui-monospace` drawn in SF Mono); the `components@app` floor is a ratcheted 0.94 with the 0.95 target held through those exceptions; the simple-geometry 0.98 floor is not enforced; iOS `input`/`select` SSIM targets are not asserted; the shadcn `w-3/4` reflow is unmeasured. The iPad `@bp` captures are evidence, not a tracked iOS baseline; breakpoint views are not rendered at mid-band widths (band widths and T−1/T only) and static accessibility parity is not run per band (the behaviour harness audits the switched view). macOS `attr-placeholder@app` is an exception (ImageRenderer cannot draw AppKit text fields; iOS judges it). State transitions are gated on timing parameters and endpoints, not mid-flight frames (D-MOTION); motion frame floors start as regression floors.
- Behaviour harness: 2 known audit issues are accepted (a stock `TextField` value reported as clipped; an e-mail address labelled with itself); hit-region findings are reported, not failing.

### Migrating from 1.x
1. Upgrade: `npm install --save-dev markswift@^2` (or `bun add -d markswift@^2`). 2.0.0 is the first npm release; the 1.x line (LayoutDoc 3) stays on the `release/1.1` branch and the `v1.0.0`/`v1.1.0` tags.
2. Saved captures: a 1.x `layout.json` (LayoutDoc 3) is rejected — `compileLayout` throws "LayoutDoc version 3 cannot be compiled by Markswift 2.0.0, which reads LayoutDoc version 4; capture the source again." Recapture with `convert`/`build`; there is no upcast.
3. Regenerate outputs in place with `markswift convert … --update` (a 1.x `.markswift.json` is accepted; hand-edited files still exit 2 unless `--force`) or `markswift build`, and replace `MarkswiftRuntime.swift` with the regenerated one: a hand-copied 1.x runtime does not contain the 2.0 layouts (`MarkswiftBands`, `MarkswiftTable`, `MarkswiftAnimation`, `MarkswiftReveal`, …).
4. New opt-ins: CLI `--breakpoints <auto|W[xH],…>` (one capture per CSS width band — auto: 390, 834x1210, 1210x834, 1376x1032 — and one view that switches at the CSS thresholds); API `ConvertOptions.breakpoints: true | { devices?, max? }` with `ConversionResult.bands`; `compileLayout(layout, { variants, darkVariants, variantProbes })` and `LibraryComponent.variants`/`darkVariants` for saved band captures; `markswift.json` `breakpoints` (top level or per component: `true`, `false` or `{ devices, max }`); `ConversionWarning.source: "breakpoints"`; `CompileResult.openStates`; the author attribute `data-markswift-opens="click|hover|contextmenu"` marks a trigger the automatic discovery misses. Without `--breakpoints` a conversion produces the same kind of single-layout view as 1.x.
5. Behaviour that changes without a flag: pages with dialogs, popovers, sheets or disclosures get state and defaulted init parameters (`is<Name>Presented`/`is<Name>Expanded: Bool = false`) and `on<Name>Dismissed` actions, so existing call sites compile; a menu trigger no longer has its own `on<Trigger>` parameter (its items' actions replace it) — call sites passing it must drop it; a `prepare` hook now also runs before each open-state capture page; CSS animations now animate and honour Reduce Motion; extracted ordered-list rows take `ordinal: Int` and their row type lost the marker field — drop the marker argument at call sites; grid spans, tables, relative offsets, placeholder colour, generated images and markers, `pointer-events: none`, `color-scheme` and bidi now follow the CSS — review screens that relied on the 1.x approximation.
6. Code that reads `LayoutDoc`: `viewport` is required, `conditions` is new, `preferredSize.insets` also appears on relative/sticky boxes, pseudo-elements may have `img` children, plus `conditional`, `layers`, `states.open`, `pseudoStyles.backdrop` and `motion`. Values whose meaning changed: a `position: relative` box's `bounds` is its in-flow box (offset removed), and consecutive generated-text parts of a pseudo-element are one `#text` child with the joined text.

## [1.1.0] — 2026-10-15

Ports the capture-free improvements of the archived core-alpha line (CSS flex freeze loop, grid `minmax` floors, live
form state, images, inline boxes, static faces) and closes the 1.0 known gaps that need no capture change (collapsed
table borders, scroll boxes, list spacing, textarea/select metrics, label focus, Chromium 153 border tones, tight
labels, theme-button pressed look, `<bdo>`/`<bdi>`). LayoutDoc stays 3; 1.0 output regenerates unchanged in format.

### Added
- `<video poster>` is drawn as an Image of the captured poster at the video's frame and `object-fit`, and `<input type=image>` as an Image of its `src` with `alt` as the label and the button trait (both reported as approximated; playback and the submit action are not translated). Both were empty placeholder boxes.
- App mode: tapping a text field's `<label>` (`for` or wrapping) focuses the field through its `@MarkswiftFocused` member, as in the browser.
- An unstyled theme-painted `<button>`/`<input type=submit|reset|button>` gets Chrome's pressed theme through its `@MarkswiftPressed` member: Chrome repaints its control theme on a press without any computed-style change, measured at DPR 2 as fill 239 → 245 and edge 118 → 141 (light) and fill and edge 107 → 97 (dark).
- `<bdo>`, `<bdi>`, `<output>` and inline `[dir]` elements inside running text wrap their runs in Unicode bidi controls in the computed direction (`<bdo>`: isolate + override, LRI/RLI LRO/RLO … PDF PDI; the others: isolate), so overridden and isolated runs order their glyphs as in Chrome; a text host that is itself a `<bdo>` only overrides. Swift literals escape bidi controls (`\u{202e}`). An author `unicode-bidi` is not captured (LayoutDoc 4).

### Changed
- Fidelity: a line wrap that falls exactly at a styled run boundary (before an `<a>` or `<strong>`) becomes a forced break like the other measured breaks; app output is unchanged.
- Inline boxes: every painted element on a run's inline chain (`<mark><b>…</b></mark>`) gets its background layer, including background images, outlines and box shadows; a transparent border no longer adds an empty layer. Inline `opacity` fades the run's glyphs, decoration, shadow and gradient fill and the inline boxes under it; inline `filter`, `backdrop-filter`, `mix-blend-mode`, `mask-image`, `clip-path` and visible text inside a hidden host are reported.
- Fidelity: a bundled family without a `wght` axis (separate static faces) selects its face by named weight (`.custom(name, fixedSize:).weight(…)`) instead of a variation the files cannot honour, so its bold face renders. `BundledFamily.wght` records the axis; app mode keeps its Dynamic Type `.custom(name, size:, relativeTo:)` fonts.
- Embedded raster backgrounds and masks (PNG, GIF, JPEG with Exif orientation, WebP) use their natural size from the image header: `background-position` is exact (e.g. `right bottom`) and repeats tile through `MarkswiftTile` with their phase and axis instead of `.tile` from the corner.
- `<img>` `object-position` percentages other than 0/50/100% are exact (the picture moves by `(box − picture) × f` through alignment guides) instead of snapping to the nearest edge or centre.
- A `data:` SVG background or mask with only a viewBox (no px `width`/`height`) has a ratio but no size, as in CSS: at `background-size: auto` it fits the positioning area instead of drawing at its viewBox size; a single px `width` or `height` takes the other axis from the viewBox ratio.
- `MarkswiftFlexRow` runs CSS's flex freeze loop: px `min-width`/`max-width` clamp items with a definite basis, shrink is weighted by the inner (content-box) basis, grow and shrink factor sums below 1 leave the unused share, and a percentage `flex-basis` or `width` (item without horizontal padding) follows the row; such rows are now admitted.
- `MarkswiftTracks` sizes `minmax(<px>, fr)` columns like CSS: a floor above its share freezes the track and the other fr tracks share the rest; an fr sum below 1 leaves space unused. Such templates are now admitted.
- Form controls start from the state the browser paints: an input value, `<textarea>` text, `checked` or `<option selected>` that a page script (or a `prepare` hook) changed after load wins over the markup attribute.
- `<fieldset disabled>` disables the controls inside it, except those in its first `<legend>`.
- Radios group by form owner (`<form>` ancestor or `form=`) and `name`, so two forms may reuse a name; an unnamed radio is select-only (a tap never clears it).
- `<select>` menus leave out `hidden` options, list `disabled` ones greyed (an `<optgroup disabled>` disables its options) and head each `<optgroup>` with a `Section`; with nothing selected the closed select shows the first enabled option.
- Collapsed table borders (`border-collapse: collapse`) are painted as Chrome does: each grid line is resolved to one border (hidden, width, style, then cell > row > group > table) and drawn centred on the line, half in the row or cell on each side and the outer half in the table, with the cells' content inset by the half. A `<tfoot>` top rule now merges with the last body row's rule instead of drawing twice, and a table caption's margin no longer stretches the rows' painted box.
- App: a CSS scroll box (`overflow: auto|scroll`) puts its frame, background, border and rounded clip on the `ScrollView` instead of the scrolling content, so its rounded bottom corners and bottom border stay while it scrolls; its padding and non-fixed overlays scroll with the content. A `height` on a vertical scroll box is its height (content past it scrolls) rather than a `minHeight` floor, and a `max-height` one no longer asks for its ideal height.
- Text between block children of a block box (`<li>Fruit<ul>…</ul></li>`) is its anonymous block's line box, like text in a flex/grid box, instead of its glyph area: app mode keeps the half-leading above and below it, so list rows and nested lists sit where Chrome puts them. An inline host (a `<label>` around a checkbox and its caption) keeps its glyph area.
- `inset`/`outset`/`groove`/`ridge` borders use Chromium 153+'s edge tones (Blink's WebKit-matching shading): the lit edges lighten unless the colour is very light, and a very dark colour lightens for both edges, so black draws #a8a8a8 lit / #545454 shadowed instead of Chrome 152's #545454 / #000.
- App mode on iOS/macOS 26+: a one-line text whose `line-height` is below the font's natural line (`leading-none` labels) keeps the CSS line box but lays its `Text` out at the natural line height, so the glyphs overflow the box as in CSS instead of the `Text` being shorter than its glyphs; the accessibility audit no longer reports such labels as clipped text (the shadcn-checkbox and shadcn-radio-group known entries are retired). Text the browser broke into lines keeps its compressed lines (`markswiftLineHeight(…, compressLines: true)`); a one-line label that wraps under Dynamic Type gets natural spacing between its lines.
- App mode: a `<textarea>`'s first line sits where Chrome's line box puts it — `TextEditor` pads half the CSS leading above its first line and below its last, less what iOS's text view already lowers a face with glyphs above its ascent (Geist) (`markswiftFieldLineHeight(…, editor: true, face:)`), instead of drawing 0.5–3.5 pt high.
- A closed `<select>` with native appearance pads its label like Chrome's menulist (4 px at the start, 16 px at the end inside the author's padding) and centres its arrow in a 15 px box at the inner border edge, over the author's end padding, as Chrome draws it (the label sat 4 pt left and the arrow ~10 pt left).
- `<input type=submit|reset|button>` captions keep one line and shrink into the measured width (the UA font Arial maps to the wider SF Pro) instead of wrapping (app) or truncating (fidelity).
- App mode: text under 12.5 pt scales with `.caption` instead of `.caption2` (`@ScaledMetric(relativeTo:)`, `.custom(_:size:relativeTo:)`, line-height modifiers): Xcode's accessibility audit reports any `.caption2`-relative font, `.font(.caption2)` included, as partially supporting Dynamic Type. Letter-spacing scales with the Dynamic Type size it rides on (`.kerning(textSize10 * 0.5 / 10.0)`); both are unchanged at the default size. The five shadcn caption `audit:dynamicType` known entries are retired.
- A labelled checkbox or radio's `.accessibilityRepresentation` names its `Toggle` with `.accessibilityLabel` instead of a label `Text`, which was laid out in the mark's small frame (growing it) and audited as clipped text; the tw-form `audit:textClipped` known entry is retired. The shadcn-input and tw-settings entries are by design (a stock `TextField` holding the same value is flagged; the design labels the address with itself).
- Visual gate: 9 of the 17 `components@app` iOS exceptions are retired (shadcn-table ×4, shadcn-textarea ×3, tw-form-390 ×2 now reach SSIM ≥ 0.95); 8 remain (shadcn-field, shadcn-item-320, tw-cards dark).

## [1.0.0] — 2026-10-14

Reusable SwiftUI components from HTML and CSS: data parameters, `ForEach` over repeated content, `on<Name>` actions, names from the markup, tool-owned output with `--update`, one Swift package for many components (`markswift build`), an npm package that runs on Node.js, and visual and behaviour gates measured on the iOS runtime.

### Added
- Every generated `.swift` file and the `UIAppFonts` fragment name the Markswift version that generated them (`// Generated by Markswift 1.0.0 — …`); `markswift --version` prints it.
- `convert --update` regenerates an existing output in place from its `.markswift.json` manifest; refuses hand-edited files (exit 2) unless `--force`; never touches files Markswift did not write.
- Diagnostics for hyphens, word/overflow-wrap breaking, text-wrap balance/pretty, word-spacing, text-indent, font-feature-settings, font-variant-caps and underline thickness/offset; `line division forced` is reported only in fidelity; percentage and shrunk widths, auto-fill/auto-fit grids, width-dependent `@media`/`@container` rules and baked `:invalid`/`:valid` styling are reported.
- npm package runnable with Node.js ≥ 20 (`npx markswift`, `import "markswift"`); a `v*` tag publishes it with npm provenance after a smoke test that installs the packed tarball without Bun.
- Every activatable element exposes a camelCase `on<Name>: () -> Void` action (buttons, `role=button`/`onclick` elements as real `Button`s, input buttons, in-app links, `form onsubmit` → `.onSubmit`); inline links are tappable `Text` runs in the design's colour.
- VoiceOver: `aria-labelledby`, `aria-describedby`, values (`aria-valuenow/valuetext/expanded`), selected/toggle traits and `aria-disabled`; iOS keyboards from `autocomplete`, `inputmode` and `enterkeyhint`.
- Tracked component corpus (`tests/conformance/fixtures/components/`, 21 shadcn/ui components, a 24-row list and 3 Tailwind pages, compiled offline with Tailwind 4.1); iOS visual baselines; per-family regression floors (`families`, `bun run quality --ratchet`) with reviewed per-capture `exceptions`; `bun run quality --readme` regenerates the README evidence block; release tags gate every fixture on iOS.
- Pressed and focused looks: `:hover`/`:active` and `:focus-visible` paint captured as paint-only state snapshots and emitted as `@MarkswiftPressed`/`@MarkswiftFocused` members driving colour, opacity and scale; state colours join the Palette tokens.
- App mode: repeated sibling elements are emitted once as a nested subview and a static data array iterated with `ForEach` (pixel-identical; rows with controls bind through `ForEach($rows)`; per-row buttons collapse into one `(Row) -> Void` action). Runs of single elements (equal texts, images or buttons in an evenly spaced stack, same colours) are extracted too; per-row buttons named after their own captions collapse into `on<Type>` instead of the first caption's name.
- Component interface: every screen has an explicit `init` with design defaults (data arrays, `data-markswift-field` texts and controls, then actions); per-row actions `(Row) -> Void`; rows with controls are screen `@State` seeded via `init` and `@Binding` in the subview; one `#Preview` per extracted subview. Names come from the markup (`data-markswift-component`, `id`, `data-slot`, `aria-label`, non-utility class, nearest heading) with `data-markswift-component`/`data-markswift-field` overrides. `CompileOptions.visibility: "public"` emits public views, inits, row structs and subviews.
- Reflow gate: `bun run pilot --reflow` renders 390-compiled code at 320 and 768 against fresh Chrome; `reflowMaxLoss` fails app-mode reflow losses on fixtures tagged `markswift-reflow: native`.
- `markswift build [markswift.json] [--force]` captures every component of a config in one browser session (4 pages at a time) and writes ONE local Swift package (swift-tools 6.2, iOS 18): public views, one module-level `public enum Palette` (one name per light/dark value pair across all components), shared `MarkswiftShapes.swift`, one `BundledFonts` and font copy, one runtime; regenerated through `.markswift.json` like `convert --update`. Library API: `buildLibrary(options)` and the browser-free `compileLayouts(components, { library })`.
- `--palette map.json` (`palette` option of `convert`, `buildLibrary`, `compileLayout`, `compileLayouts` and `markswift.json`) maps captured colour tokens, keyed by CSS variable or hex, to the app's own Swift colours; views keep referencing `Palette.x`; unmapped tokens and unused keys are `palette` warnings.
- App-mode grids keep their authored tracks (`fr`, `auto`, px, `repeat(auto-fill|auto-fit, minmax(px, 1fr))`) via `MarkswiftTracks`; percentage widths keep their fraction via `MarkswiftFraction`.
- App-mode flex rows with unequal grow, px/0/content bases and shrink reflow via `MarkswiftFlexRow` when a solver mirror reproduces Chrome; conversions with such rows (or admitted grids) take a second probe capture at 320px to confirm (`probe: false` skips it).

### Changed
- The quality gate names the old and new value of a changed capture configuration and prints a rebaseline hint on toolchain drift; the Visual Toolchain step lists simulator runtimes; a missing tracked baseline fails with instructions.
- `--renderer ios` renders through UIHostingController + drawHierarchy in a batched simulator app, so text fields, editors and scroll views are drawn instead of ImageRenderer's yellow placeholder; the pinned simulator (`MARKSWIFT_SIMULATOR`, default `iPhone 17`) is created on the newest iOS runtime when missing.
- App-mode `line-height` emits `markswiftLineHeight` (runtime): exact CSS line boxes and the browser's baselines on iOS 26+, today's `.lineSpacing` path on iOS 18–25; sub/sup line-box growth is no longer counted twice, and line-box growth under 2 px (a `kbd` border) is kept in app mode.
- The static asset server and font conversion use `node:` APIs; the webfont converter script is embedded in the bundle.

### Changed (breaking)
- Install from npm (`npm install --save-dev markswift`); the Bun git dependency of the alpha is retired.
- Generated views are tool-owned: the header says `— tool-owned: regenerate with \`markswift convert --update\`; customise through the initializer or your own files.` (`markswift build` output: `regenerate with \`markswift build\``) instead of "do not edit"; every output directory contains `.markswift.json`, and `--update` refuses a directory without it.
- `ConversionResult.warnings` and `CompileResult.warnings` are `ConversionWarning` objects (`source`, `level?`, `feature?`, `component?`, `message`) instead of strings; the CLI prints `Warning: [<component>] <level> <feature>: <message>` (each part only when set).
- LayoutDoc 3: saved alpha (version 2) layouts are rejected by `compileLayout` with an error naming both versions; recapture them. Version 3 adds eight captured text properties, `PreferredSize.gridTemplateColumns` and `LayoutNode.states`, and is frozen with this release: a style-list or schema change requires a LayoutDoc version bump and a major release (enforced by `tests/architecture/layout-doc.test.ts`).
- Action members are renamed `on_x` → `onX`; `<div role=button>` is a `Button` instead of a view with an `.isButton` trait.
- Repeated content is a `ForEach` over `<Screen>.<Row>` data with a `<Screen>.<Row>View` subview, passed through the screen's `init`; generated type and member names come from the markup, so names change on regeneration.

### Fixed
- ARIA toggles drawn as Buttons (`role=checkbox|switch|radio…`, Radix/shadcn) own `@State` seeded from `aria-checked` (`Bool`, `Bool?` for `mixed`; the radios of one `role=radiogroup` share a `String` selection): a tap, or a tap on their `<label>`, changes it and then calls `on<Name>`, and VoiceOver's checked state follows it. The drawn look stays the captured state.
- An `opacity: 0` `aria-hidden` element (Radix's form-value `<input aria-hidden>` beside each toggle) is dropped instead of emitted as a hidden `Toggle` iOS still exposed.
- `aria-labelledby`/`aria-label` on a text-only container role (`role=tabpanel`, region, group, …) names a group around the Text (`.accessibilityElement(children: .contain)`) instead of replacing the Text's words.
- An unstyled `<button>`, input button or text field paints Chrome's control theme (1px grey edge, 2px corners) instead of its computed UA `2px outset`/`2px inset` border; an author background, border, radius or `appearance: none` keeps the CSS paint.
- Generated code also compiles in targets without MainActor default isolation (`MarkswiftMarkToggleStyle` and `MarkswiftDisclosureStyle` used the main-actor `.plain` button style from a `nonisolated` style).
- The visual comparison decodes Display-P3 renders to sRGB: the 16-bit P3 PNGs of filtered macOS captures were scored on raw bytes (filter fidelity mean 0.751 instead of 0.925).
- `margin: 0 auto` / `margin-left: auto` on fixed- or content-width blocks centres / right-aligns them.
- `filter: brightness()` multiplies like CSS (`.contrast(x).brightness((x − 1)/2)`).
- Clipped `max-height` text shows its first lines in `app` mode.
- A table's background, border and radius no longer wrap its `<caption>`.
- `<select>` is labelled by its selection (a `Menu` over an inline `Picker`), not by all its option labels.
- `<textarea>` keeps its default text and shows its placeholder; text fields draw no macOS bezel inside the CSS box.
- `<input type=submit|reset|button>` paint their caption (`@value`, else "Submit"/"Reset").
- Date/time pickers show the components of their input type and start at the design's value instead of now.
- `<details>` draws its captured summary and marker without a system chevron or a pinned closed height.
- `appearance` and `accent-color` are captured: `accent-color` tints checkboxes, radios, ranges and progress bars; `appearance: none` removes the select arrow and keeps the author's box on checkboxes and ranges.
- App mode grows with Dynamic Type: fixed heights on boxes that lay out text are floors (content Chrome lets overflow the box, such as an icon taller than its badge, does not grow it), `MarkswiftMeasuredLayout` moves frames below a grown child, hugging label columns fit their text (`markswiftFitWidth`), `TextEditor` sizes to its text, fields honour CSS `line-height` growth, an off-centre text's line-box surplus is a floor instead of padding, and a control's chevron stays beside its label. The R7 behaviour check scales the Chrome reference to true AX3 (measured per-text-style factors; it launched at AX2 before) and treats authored heights as floors.
- Text straight inside a flex or grid box beside other items (an accordion trigger's title beside its chevron) keeps its CSS line box instead of its glyph area, so the row is as tall as in the browser.
- A table caption painted below its rows (`caption-side: bottom`) stays below them even when the markup puts it first; the table's paint no longer lands on the caption's side.
- App mode: a hugging box with a `max-width` (an empty state's `max-w-sm` column) fits the width its container offers instead of growing to its content's one-line width past it.
- App mode: a button or link taller than its label (`h-8`, `size-8`) keeps the label where the browser put it — centred — when its height becomes a Dynamic Type floor, instead of pinning it to the top.
- App mode: `text-wrap: balance` text that wraps keeps native line breaking at the narrowest width that holds its line count (`markswiftBalance`), so its lines come out about equally long as in the browser instead of greedy.
- App mode: a disabled text field or editor keeps the design's `:disabled` opacity; SwiftUI does not dim a field whose text has its own colour, so its text stayed at full strength.
- App mode: text fields and editors in a bundled webfont honour CSS `line-height` too, spaced from that face's own natural line (they kept the face's natural line before), so a `<textarea>`'s lines sit as far apart as in the browser.
- A control's content stays where the browser laid it out inside a fixed-size control on both axes (a Radix switch's thumb at the track's start, moved only by its transform) instead of being centred.
- App mode: a `<textarea>`'s `TextEditor` no longer fades its first line under iOS 26's scroll edge effect.
- App mode: a `<select>`'s, text input's or date input's single line stays vertically centred in its box when the box's height becomes a Dynamic Type floor, as Chrome centres it.
- A table row's or row group's bottom border (`border-b` on a `<tr>` in a collapsed table) no longer adds a point of padding to the row: CSS ignores row padding and a collapsed border lies inside the cells, so every row came out one point too tall.
- A table row whose cells are `vertical-align: middle` (or `bottom`) centres (or bottom-aligns) a cell shorter than the row, instead of pinning it to the row's top.

### Known limitations
- Not translated: JavaScript behaviour; breakpoint branching (one viewport and one layout per capture; media and container queries, iPad and landscape layouts are not reconstructed; paint-only pressed/focused deltas are captured, other states are not); dialogs and popovers; CSS animations and transitions (end state, reported); `<select multiple>`, `<datalist>`, `<bdo>`/`<bdi>`; inline handlers on non-link elements inside running text; `ui-monospace` maps to a different native face; tapping a `<label>` does not focus its text field.
- Pinned geometry in `app` mode (reported in diagnostics): flex-wrap outside the native-wrap subset; unequal flex growth outside the `MarkswiftFlexRow` subset (the full flex algorithm with wrap + grow and the min/max freeze loop is not implemented); grids outside `MarkswiftTracks` with spans, holes, overlap or RTL placement; inline-block rows; tables.
- 17 of the 100 `components@app` iOS captures are listed exceptions to the 0.95 component target (at most 20 % allowed; reasons and owners in `tests/conformance/visual-policy-ios.json` and the README).
- iOS behaviour suite: 10 known accessibility-audit issues (`tests/conformance/ios-behaviour.json`); hit-region findings are reported, not failing.
- Also open: a CSS scroll box paints its background, border, radius and min-height inside the `ScrollView`; `<ul>` item spacing differs from Chrome; `<input type=submit|reset|button>` captions in the UA font can truncate or wrap; UA-bordered buttons use Chromium 152 shading; theme-painted buttons have no pressed look.
- Thresholds relaxed against the 1.0 research targets: a 0.98 floor for simple geometry is not enforced; the iOS `input` ≥ 0.80 and `select` ≥ 0.85 targets, `margin-top` ≥ 0.90 and `min-width` ≥ 0.95 are not asserted; the shadcn `w-3/4` percentage-width reflow has no fixture; the fidelity reflow target was dropped and `display: grid`, card-header and alert-grid accept a reflow Δ of −0.03; the inline line-box surplus correction applies above 2 px; viewport-dependent CSS needs ≥ 1 warning, and no check asserts a diagnostic on every node that loses more than 0.05 SSIM; CI reports the Xcode toolchain instead of pinning it; iOS visual runs are not sharded.
- Not yet in the gate: font-family tags, `line-clamp`, `text-align: justify` and `writing-mode` are not marked reference-limited; body re-evaluation and scroll-hitch benchmarks do not exist. The unused `stepper` control kind is still in the model.

### Migrating from 0.1.0-alpha.1
1. Install from npm: `npm install --save-dev markswift` (Node.js ≥ 20 or Bun ≥ 1.4.2) and run `npx markswift`; the Bun git dependency is retired.
2. Output is tool-owned: regenerate instead of editing, and move customisations into your own files and extensions or the init parameters. The view header no longer says "do not edit"; it reads `— tool-owned: regenerate with \`markswift convert --update\`; customise through the initializer or your own files.` (`markswift build` output: `regenerate with \`markswift build\``).
3. Re-convert every screen once into a fresh `--out` directory: alpha output has no `.markswift.json`, so `--update` exits 1 on it even with `--force`, and `--force` without `--update` is a usage error. Move your own files across, then use `--update` on that directory from then on.
4. Action members are renamed `on_x` → `onX` (`() -> Void = {}`); every button and activatable element now has one; per-row actions are one `(Row) -> Void`; inline links call the same actions through `openURL`.
5. Repeated content is a `ForEach` over `<Screen>.<Row>` data drawn by `<Screen>.<Row>View`; the per-member container properties are gone; pass data through the screen's `init(<rows>:…)`.
6. Several components: use `markswift build` (one Swift package with a shared `Palette`, fonts, images, one runtime and public views) instead of adding several conversions' `MarkswiftRuntime.swift` to one target.
7. Every generated file carries `// Generated by Markswift <version>`; replace the runtime when you upgrade.
8. `ConversionResult.warnings` and `CompileResult.warnings` are `ConversionWarning` objects (`source`, `level?`, `feature?`, `component?`, `message`) instead of strings: read `.message` (and `level`/`feature` for design losses). The CLI prints `Warning: [<component>] <level> <feature>: <message>` (each part only when set); update scripts that parsed the old `Warning: …` lines.
9. Saved LayoutDocs (`layout.json`) from the alpha are LayoutDoc version 2; 1.0 reads only version 3 and rejects older ones with an error naming both versions. Recapture the source instead of recompiling a saved LayoutDoc.

## [0.1.0-alpha.1] — 2026-10-10

First alpha: visually faithful SwiftUI starting code for one captured component (iOS 18+, Swift 6, `app` mode by default).

### Added
- Adaptive light/dark conversion: two captures, one view, `Color.markswift(light:dark:)` tokens; `--theme`, `--dark-class`.
- Generated Swift always compiles: escaped string literals, iOS 18 / Swift 6 strict-concurrency compile matrix, macOS builds via `canImport` branches.
- Typed diagnostics: every approximation or omission names a conformance inventory feature; the CLI prints one `Note` line per distinct loss.
- Silent inference losses fixed or reported (fonts, rows, paint, animations, whitespace, SVG defaults, clips, filters, markers, `foreignObject`).
- App-mode sizing follows CSS intent: min-height and alignment slack, viewport-high roots, control height floors, scrolling pages with fixed overlays outside the scroll view, `object-fit`/`object-position`, overlays anchored to their right/bottom CSS corner.
- Flex: `align-self`, reverse and RTL packing, auto margins as `Spacer`s, native reflow of intrinsic `flex-wrap` items with the default `flex-shrink`.
- Tailwind v4: individual `translate`/`rotate`/`scale` transforms, gradient interpolation clauses and magic-corner directions.
- Dynamic Type for system and custom fonts in `app` mode; native `Text` line breaking for paragraphs; VoiceOver labels, headings, hidden elements and role traits; labels that name and toggle their controls; one selection per radio group; keyboard and content type from the input type.
- Capture robustness and security: `timeoutMs` bounds a whole conversion; font bytes fetched over `http(s)` only, size-capped; `untrustedInput` also blocks DNS and stray navigations; the asset server refuses foreign hosts, dotfiles and malformed paths; redirected, mistyped and lazy images are embedded; a missing `python3` is reported.
- Raster images ship as deduplicated `Images/<hash>.<ext>` bundle files.
- Reproducible visual gate: colour SSIM with mismatch and anchor checks, tracked macOS baselines (`tests/conformance/baselines/`), per-renderer policies, `bun run quality --summary`.
- Playground (`playground/`) tracked: non-destructive workbench with stale-output marking, fidelity summary, file tabs and offline recovery; restricted capture policy for every paste.
- CI workflows (`.github/workflows/ci.yml`, `visual.yml`) and the Biome formatter/linter (`bun run lint`).
- Resolved IR with model-owned value types and an architecture layering test.

### Changed (breaking)
- Legacy `h2s` compatibility removed: `data-h2s-root`/`data-h2s` markers, `H2S_*` env variables and LayoutDoc version 1. LayoutDoc is version 2.
- `theme` defaults to `adaptive` (light + dark capture, adaptive colour tokens).
- Per-view namespacing: colour tokens live in `<View>.Palette` (`<View>+Tokens.swift`), shapes are nested in the view type (`<View>+Shapes.swift`) and bundled fonts register through `<View>.BundledFonts.register(in:)` (`<View>+Fonts.swift`, `<View>+UIAppFonts.plist.fragment`).
- `app` mode emits native `Text` for paragraphs; `MarkswiftGreedyText` is removed.

### Known limitations
- Not a reusable component: no parameters, `ForEach` or meaningful names.
- Pinned geometry in `app` mode: flex-wrap outside the native subset, non-trivial grids, inline-block rows, tables, unequal flex growth.
- One viewport and state per capture; JavaScript behaviour is not translated.
- No feature is approved at an absolute visual floor; box-shadow is not re-approved in `app` mode. The iOS-runtime visual baseline does not exist yet (needs an iOS Simulator runtime); macOS `ImageRenderer` numbers understate `app`-mode text and cannot rasterise native controls.
- VoiceOver, hit-testing and runtime image loading are verified by typecheck only, not on a simulator.
