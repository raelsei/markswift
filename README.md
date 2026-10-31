# Markswift

[![npm](https://img.shields.io/npm/v/markswift)](https://www.npmjs.com/package/markswift)
[![CI](https://github.com/raelsei/markswift/actions/workflows/ci.yml/badge.svg)](https://github.com/raelsei/markswift/actions/workflows/ci.yml)
[![Visual](https://github.com/raelsei/markswift/actions/workflows/visual.yml/badge.svg)](https://github.com/raelsei/markswift/actions/workflows/visual.yml)

Convert rendered HTML and CSS into reusable SwiftUI components. How it works, step by step:
[markswift.koray.dev](https://markswift.koray.dev/).

Markswift captures a page or component in Chrome and writes SwiftUI for iOS 18+ and Swift 6 that looks like the
browser's rendering and can be reused: repeated siblings become a `ForEach` over a data array with an extracted row
view, every button and link is an `on<Name>` closure parameter, and the screen has an explicit `init` whose parameters
default to the design. Names come from the markup (`id`, `data-slot`, `aria-label`, class, nearest heading) and can be
set with `data-markswift-component` / `data-markswift-field` ([Components](#components)). The output is tool-owned:
regenerate it with `--update` and customise through the initializer and your own files
([Regenerating](#regenerating)); `markswift build` puts many components into one Swift package. `app` mode is the
product, `fidelity` exists for verification ([Modes](#modes)). What is measured on iOS is listed under
[Supported subset](#supported-subset-evidence); everything else the capture loses is reported (see
[Diagnostics](#diagnostics)).

New in 3.0:

- Responsive percentage translations, SVG cover/contain sizing, and measured relative offsets, including inline text.
- Nested overlays and submenus, repeated-row presentation actions, responsive dialogs, and fresh layers per breakpoint.
- Exact available system-font axes, width-specific webfont selection, resolved monospace faces, iOS fractional text boxes,
  and greedy wrapping for plain multiline paragraphs (packaged font metrics or the default system font) on iOS 26+.
- Nested colour schemes, pointer pass-through regions, and generated images that scale
  with Dynamic Type. iPad breakpoint reflow now has a tracked CI gate.

Upgrading from 2.x: LayoutDoc 5 replaces LayoutDoc 4. Recapture saved documents and regenerate all views with their
shared runtime together — see [Migrating from 2.x](CHANGELOG.md#migrating-from-2x). Swift output still targets iOS 18+;
the new paragraph wrapper uses a SwiftUI fallback before iOS 26.

## Requirements

- Node.js ≥ 20 or Bun ≥ 1.4.2 (tested with 1.4.3), and an installed Google Chrome.
- `python3` with `fontTools` and `brotli` to bundle webfonts. Without them the conversion still
  completes and reports each font it could not bundle.
- Xcode, only to compile the generated Swift.

## Install

```sh
npm install --save-dev markswift
npx markswift --version    # or: bunx markswift --version
```

From a checkout (contributors):

```sh
git clone git@github.com:raelsei/markswift.git && cd markswift
bun install --frozen-lockfile
bun src/cli.ts --version
```

In a checkout write `bun src/cli.ts` for `npx markswift` and `from "./src/index.ts"` for `from "markswift"`.

## Quick start (CLI)

```sh
printf '%s\n' '<main data-markswift-root style="width:240px;height:80px;font:18px system-ui">Hello Markswift</main>' \
  | npx markswift convert - --name HelloCard --out ./generated-hello
```

prints `Wrote 3 files for HelloCard to ./generated-hello`. `--out` must not exist yet; regenerate later with `--update`; one
conversion writes several files. Other inputs: `npx markswift convert ./page.html --out ./out`
(relative assets resolve beside the file), `--css ./compiled.css` for a separate **compiled**
stylesheet, and `--url http://localhost:5173/card --root '#preview'` for a running page.

Options (`npx markswift convert --help`): `--out <dir>` (required), `--update`, `--force`, `--name <Name>` (default
`ConvertedView`), `--root <selector>`, `--width`/`--height` (default 390 × 844),
`--theme adaptive|light|dark` (default `adaptive`), `--dark-class <name>`, `--mode app|fidelity`
(default `app`), `--css <file>`, `--url <url>`, `--breakpoints <auto|W[xH],…>` (one capture per CSS width band — auto:
390, 834×1210, 1210×834, 1376×1032 — and one view that switches at the CSS thresholds). Exit status: 0 converted,
2 invalid options or hand-edited files refused by `--update`, 1 conversion or file error. Warnings and diagnostics go
to stderr.

## What you get

| File | When |
| --- | --- |
| `<Name>.swift` | Always: the view with an explicit `init`, a light and a dark `#Preview`, plus `extension <Name> { struct <Type>; static let <types>; struct <Type>View }` with extracted row types, data, subviews and one `#Preview` per subview when the design repeats sibling elements, and one `#Preview` per width band for breakpoint conversions |
| `<Name>+Tokens.swift` | Always: colours in `<Name>.Palette` |
| `MarkswiftRuntime.swift` | Always: shared helpers; its header names the Markswift version, and every conversion by that version produces the identical file |
| `<Name>+Shapes.swift` | When SVG or clip shapes exist |
| `<Name>+Fonts.swift`, `<Name>+UIAppFonts.plist.fragment`, `Fonts/*.ttf` | When webfonts were bundled |
| `Images/<hash>.<ext>` | When the component shows raster images (one file per distinct image) |
| `.markswift.json` | Always: the manifest `--update` reads (`tool`, `version`, and the SHA-256 of every file this run wrote) |

Every generated `.swift` file starts with `// Generated by Markswift <version> — …`; `npx markswift --version` prints
the same version.

## Components

Repeated sibling elements (app mode) become a row type `<Type>`, a subview `<Type>View` and a data array `<types>`
(`static let`, the design's rows) iterated with `ForEach`. The screen always has an explicit `init` whose parameters
all default to the design, in this order: data arrays, annotated fields, actions:

```swift
// TeamCards.swift, generated from tests/conformance/fixtures/components/tw-cards.html with --name TeamCards:
init(inviteATeammateCards: [InviteATeammateCard] = Self.inviteATeammateCards, onMessage: @escaping (InviteATeammateCard) -> Void = { _ in }, onManage: @escaping (InviteATeammateCard) -> Void = { _ in })

// Your code:
TeamCards()                                                    // the design as captured
TeamCards(onMessage: { card in print("message", card.title) }) // card: TeamCards.InviteATeammateCard
```

- A run can be single elements too (a text, an image, a button): adjacent equal leaves become a `ForEach` when their
  colours agree and the stack spaces them evenly; otherwise they stay unrolled.
- Per-row buttons collapse into one `on<Name>: (<Type>) -> Void` that receives the tapped row (`on<Type>` when the
  buttons were named after their own captions); other actions are `() -> Void`.
- State: rows with controls are owned by the screen as `@State` seeded through `init`; the subview takes `@Binding var <type>: <Type>`.
  Grids and measured, wrapping or distributed stacks call the subview per element from `Self.<types>[i]` and are not parameters.
- Extracted ordered-list rows derive their marker from the row index: the marker string field is gone from the row
  type and the row subview takes `ordinal: Int`.
- Names come from the markup, first match wins: `data-markswift-component`, `id`, `data-slot`, `aria-label`, the first
  non-utility class, else the nearest heading plus a tag noun (`li` → `Row`, `article` → `Card`, else `Item`). Fields use
  `data-markswift-field`, then `data-slot`/class, then their kind (`title`, `text`, `foregroundColor`, `isOn`, …).
  Override poor names with the two attributes:

```html
<h2 data-markswift-field="title">Team members</h2>
<ul>
  <li data-markswift-component="Member">
    <span data-markswift-field="name">Ada</span> <span data-markswift-field="role">Owner</span>
  </li>
</ul>
```

  `data-markswift-field` outside a repeated row turns a single-run text into `var <field>: String` or seeds a form
  control's state through `init`. Names are API: a rule change renames them on regeneration (noted in the changelog).
- `convert` emits internal types; the `visibility: "public"` compile option (for a generated library) makes the
  view, its `init`, row structs (with an explicit `public init`), data arrays and subviews `public`.

## Regenerating

Generated files are tool-owned. Every output directory carries `.markswift.json` (`tool`, `version`, and `files`:
each written path → its SHA-256). When the design changes, rerun the same command with `--update`: it rewrites the
listed files, deletes listed files the new output no longer produces, and never touches a file it did not write. If a
listed file was edited by hand it refuses with exit 2 and names the file (`--update --force` discards those edits;
`--force` alone is a usage error); an unlisted file in the way of a new generated file is always refused, and so is a
directory without `.markswift.json` (exit 1, even with `--force`). Customise through the component's initializer,
[`--palette`](#using-your-apps-colours---palette), `extension`s and wrappers in your own files, and commit the output
directory including `.markswift.json`.

## Library API

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { convertHtml } from "markswift";

const result = await convertHtml(
  '<article data-markswift-root class="card"><h2>Hello SwiftUI</h2><p>Made from HTML.</p></article>',
  {
    name: "WelcomeCard",
    css: `
      body { margin: 0; }
      .card { width: 320px; padding: 24px; background: #f4f4f5; border-radius: 16px; }
      h2, p { font-family: system-ui; }
    `,
  },
);

console.log(Object.keys(result.files), result.diagnostics.length, result.warnings);
for (const [path, data] of Object.entries({ ...result.files, ...result.assets })) {
  const file = `generated-welcome/${path}`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}
```

- `convert(source, options)` takes `{ file }`, `{ url }` or `{ html, baseURL?, assetsDir? }`;
  `convertHtml(html, options)` is the string shorthand. `compileLayout(layout, { name, mode, dark })`
  recompiles a saved `LayoutDoc` (version 5) without Chrome; it does not package fonts. A saved `LayoutDoc` is a
  cache, not an interchange format: Markswift compiles only the LayoutDoc version it captures (`LAYOUT_DOC_VERSION`)
  and rejects any other with an error naming both versions — recapture the source. A change to the captured style
  list or the schema bumps the LayoutDoc version and is a breaking release. `compileLayout(layout, { variants,
  darkVariants, variantProbes })` compiles saved width-band captures (ascending, `layout` is band 0) into one view.
- Options: `name`, `mode` (`app` | `fidelity`), `theme` (`adaptive` | `light` | `dark`),
  `darkClass`, `css` (compiled CSS), `root` (default `[data-markswift-root]`, otherwise `body`),
  `viewport` (default 390 × 844), `dpr` (default 1), `waitFor`, `prepare(page)`,
  `untrustedInput`, `timeoutMs` (default 120000 ms for the whole conversion), `breakpoints` (`true` or
  `{ devices?, max? }`: captures one LayoutDoc per CSS width band, see `bands`, and emits one view whose differing
  elements switch at the CSS thresholds through `MarkswiftBands`; a stack or grid query container switches its
  content on width `@container` queries at its own width, from extra captures of each band: its top and, past the
  first band, its lower bound). Open states
  need no option: triggers are found automatically (ARIA `aria-haspopup`/`aria-expanded`, native
  `popovertarget`/`commandfor`/`interestfor`/`<details>`, shadcn `data-slot`,
  `data-markswift-opens="click|hover|contextmenu"`), at most 12, and each is opened
  in its own page per theme (~0.3 s); what it opens is captured in `layout.layers`. App mode emits the in-flow ones (a
  closed `<details>`, collapsible or accordion item): the content sits behind an `is<Name>Expanded` state seeded
  through `init`, the trigger toggles it and announces expanded/collapsed, and a `#Preview` shows it open. Dialogs,
  alert dialogs, sheets, popovers and hover cards are drawn presentations (`.markswiftPresentation`) behind an
  init-seeded `is<Name>Presented`; menus, menubars and selects open native `Menu`/`.contextMenu` popups.
- Result: `code`, `files` (every Swift source), `assets` (fonts and images), `diagnostics`,
  `warnings` (`{ source, level?, feature?, component?, message }[]`: page and resource errors, viewport-dependent CSS
  the view does not follow, font packaging, light/dark pairing, width-band merging), `layout` and, for adaptive
  conversions, `darkLayout`;
  with `breakpoints`, `bands` (one `{ layout, darkLayout? }` per width band, ascending; `bands[0].layout` is `layout`);
  in app mode with an in-flow layer or a presentation, `openStates` (layer id → its `init` label).

## Modes

- `app` (default) is the product: native stacks, grids and text. Plain ASCII multiline paragraphs
  use UIKit word wrapping on iOS 26+ to avoid SwiftUI orphan prevention, including multiline clamps.
  Rich runs, other scripts, older iOS and macOS retain SwiftUI `Text` and native line breaking.
  System and custom fonts scale with Dynamic Type (`@ScaledMetric`, `relativeTo:`) and boxes grow
  with their text: a measured or authored height on anything that lays out text (text, stacks,
  grids, text-bearing controls) is a floor (content CSS lets overflow the box does not grow it),
  measured layouts move what lies below a grown child,
  hugging label columns fit their text instead of a pinned width, and text editors size to their
  text. Pages taller than the viewport scroll.
  CSS `line-height` uses `.lineHeight(.multiple(…))` on iOS 26+ (exact line boxes; tight leading
  compresses text the browser broke into lines, while one-line text keeps its line box and lets the
  glyphs overflow it) and `.lineSpacing` on iOS 18–25 (`MarkswiftRuntime.swift`, `markswiftLineHeight`).
  ARIA names, descriptions, values and states reach VoiceOver; `autocomplete`, `inputmode` and
  `enterkeyhint` choose a text field's iOS keyboard, autofill type and Return key.
- `fidelity` keeps the captured geometry and line division at fixed sizes. It exists for visual
  verification.

## Light and dark

`theme: "adaptive"` (default) captures the page with `prefers-color-scheme: light`, then `dark`, and
emits one view from the light capture. Every colour that differs becomes a
`Color.markswift(light:dark:)` token in `<Name>.Palette`. Class-based themes (for example `.dark`)
need `darkClass: "dark"` (`--dark-class dark`), added to `<html>` for the dark capture. Nodes or
colour slots present in one theme only, or whose geometry differs by more than 0.5 px, keep their
light values and are reported in one `warnings` entry. `light` or `dark` captures one theme.
`compileLayout(light, { dark })` pairs saved captures without a browser.

### Using your app's colours (--palette)

`--palette map.json` (`palette` in `ConvertOptions`, `BuildOptions` and `markswift.json`) points generated `Palette`
tokens at colours your app already has:

```json
{
  "--primary": "Color.accentColor",
  "#e2e8f0": "Color(\"Border\")",
  "#ffffff/#0a0a0a": "Color(\"Card\")"
}
```

A key is the design's CSS variable (`--primary`), a static token's hex colour (`#rrggbb` or `#rrggbbaa`), or an
adaptive token's `#light/#dark` pair; the CSS variable wins over the hex. Values are one-line Swift `Color`
expressions emitted verbatim (your app's typecheck validates them). Views keep referencing `Palette.x`; only the
token's value changes, and its doc comment keeps the captured colour. Tokens without an entry and entries that matched
no token are listed as `palette` warnings. Single-use colours stay inline and are not mapped. Mapped colours are not
part of the visual verification.

## Adding the output to Xcode

Add **all** generated `.swift` files to one target. For webfonts add `Fonts/` as resources and
either merge `<Name>+UIAppFonts.plist.fragment` into the app's Info.plist or call
`<Name>.BundledFonts.register(in:)` with the resource bundle before rendering. Add `Images/` as
resources; inside a Swift package set `MarkswiftAssets.bundle = .module` once at startup.

Several conversions can share one target: every per-view declaration (palette, shapes, bundled
fonts) is nested in the view's type and its files are prefixed with the view name. Add
`MarkswiftRuntime.swift`, each `Fonts/` file and each `Images/` file once. When you upgrade
Markswift, replace the runtime and re-convert older screens. For many components with one shared runtime, palette and
font set, use [`markswift build`](#building-a-component-library-markswift-build).

## Building a component library (markswift build)

`markswift build [markswift.json] [--force]` captures every component of a config in one browser session and writes
ONE local Swift package. Paths are relative to the config file; `serve` (default: the config's directory) is served
over `http://127.0.0.1` so relative URLs such as `../assets/geist.woff2` resolve inside it. `root`, `viewport`,
`theme`, `darkClass`, `mode`, `css`, `waitFor` and `breakpoints` apply to every component; a component may override any
of them. `breakpoints` is `true` or `{ devices, max }`: one view across CSS width bands, as `convert --breakpoints`
(`false` turns a shared value off).
`source` is a file inside `serve` or an `http(s)` URL. Names must be Swift type names that SwiftUI does not already
use (`ButtonView`, not `Button`).

```json
{
  "library": "ShadcnKit",
  "out": "ShadcnKit",
  "serve": "fixtures",
  "root": "[data-markswift-root]",
  "theme": "adaptive",
  "components": [
    { "name": "AccordionView", "source": "fixtures/components/shadcn-accordion.html" },
    { "name": "CardView", "source": "fixtures/components/shadcn-card.html", "theme": "light" }
  ]
}
```

The package (`Package.swift`, swift-tools 6.2, iOS 18 / macOS 15, Xcode 26) holds `Sources/<Library>/` with one
public `<Component>.swift` per component, `MarkswiftPalette.swift` (one module-level `public enum Palette`: one name
per light/dark colour pair across all components), `MarkswiftShapes.swift`, `MarkswiftFonts.swift` and `Fonts/`
(each webfont once), `Images/`, and one `MarkswiftRuntime.swift` (reading resources from `Bundle.module`). Add it once
with **File ▸ Add Package Dependencies ▸ Add Local…**, call `BundledFonts.register()` once at app launch (previews
call it themselves), then `import ShadcnKit` and use `AccordionView()`. Libraries generated separately coexist in one
app: each keeps its runtime internal.

Regeneration works like `convert --update`: rerunning `markswift build` replaces only the files listed in
`.markswift.json` and deletes listed files it no longer produces (a component removed from the config loses its
view); a hand-edited generated file stops the build with exit 2 unless `--force`; your own files in the directory are
never touched; an existing `out` without the manifest is refused. Customise through parameters and your own files,
not by editing generated files. From code: `buildLibrary({ library, components, serveRoot })`, or
`compileLayouts(components, { library })` for saved `LayoutDoc`s without Chrome.

## Supported subset (evidence)

Numbers come from the tracked iOS baseline `tests/conformance/baselines/visual-all-ios.json`:
1304 captures (every conformance fixture at 320 and 390 px, light and dark where the fixture has
both, in both modes, plus 52 `app` captures at 390 px of open layers (`@open:`) and animation frames (`@t:`)),
captured 2026-10-30 (UTC) from source revision `69c7981` with Playwright's pinned Chromium 153.0.8010.12 and rendered on
the iOS runtime (`iPhone 17 com.apple.CoreSimulator.SimRuntime.iOS-27-0`, Xcode 27.1,
`UIHostingController` + `drawHierarchy`, so text fields, editors and scroll views are drawn natively). The
`components` family is 40 shadcn/ui and Tailwind component pages, 13 of them overlays opened by a trigger
(`tests/conformance/fixtures/components/`), compiled
offline with Tailwind 4.1. The metric is colour SSIM (minimum over R, G and B, at 1×, both images decoded to sRGB)
plus pixel mismatch and element-region anchors. `components@app` is held at SSIM ≥ 0.95 per capture except the
exceptions listed below (at most 20 % of its captures, each with a reason and an owner); every other family has a
ratcheted regression floor that never goes down. The block below is generated by
`bun run quality --readme tests/conformance/baselines/visual-all-ios.json tests/conformance/visual-policy-ios.json`
(a test fails when it is stale); `bun run quality --summary <manifest.json>` also prints the per-fixture table.

<!-- quality-summary tests/conformance/baselines/visual-all-ios.json -->
| domain | mode | n | mean ssim | min ssim | mean mismatch | anchors ok |
|---|---|---|---|---|---|---|
| attribute | app | 18 | 0.9649 | 0.8576 (attr-alt-320-light-app) | 0.0170 | 0/0 |
| breakpoints | app | 26 | 0.9778 | 0.9158 (swap-320-light-app) | 0.0070 | 0/0 |
| components | app | 198 | 0.9837 | 0.9236 (shadcn-field-320-dark-app) | 0.0091 | 0/0 |
| css-layout | app | 74 | 0.9883 | 0.8375 (display--contents-320-light-app) | 0.0105 | 16/16 |
| css-misc | app | 30 | 0.9800 | 0.9338 (motion-unmapped-390-light-app) | 0.0173 | 0/0 |
| css-paint | app | 94 | 0.9522 | 0.7061 (content-320-dark-app) | 0.0227 | 12/12 |
| css-typography | app | 112 | 0.9354 | 0.5713 (word-break-320-dark-app) | 0.0297 | 0/0 |
| html | app | 78 | 0.9481 | 0.8181 (pre-320-dark-app) | 0.0260 | 4/4 |
| svg | app | 40 | 0.9806 | 0.9326 (svg-lineargradient-320-dark-app) | 0.0159 | 0/0 |
| tailwind-v4 | app | 8 | 0.9490 | 0.8750 (gradients-390-dark-app) | 0.0270 | 0/0 |
| attribute | fidelity | 18 | 0.9429 | 0.8417 (attr-alt-320-light-fidelity) | 0.0230 | 0/0 |
| breakpoints | fidelity | 26 | 0.9784 | 0.9290 (switch-390-light-fidelity) | 0.0074 | 0/0 |
| components | fidelity | 160 | 0.9773 | 0.9161 (shadcn-textarea-320-dark-fidelity) | 0.0104 | 0/0 |
| css-layout | fidelity | 74 | 0.9778 | 0.9370 (min-width-320-light-fidelity) | 0.0138 | 16/16 |
| css-misc | fidelity | 18 | 0.9519 | 0.9003 (motion-unmapped-320-light-fidelity) | 0.0258 | 0/0 |
| css-paint | fidelity | 94 | 0.9501 | 0.8923 (list-style-type-320-dark-fidelity) | 0.0256 | 12/12 |
| css-typography | fidelity | 112 | 0.9265 | 0.6544 (font-family-320-dark-fidelity) | 0.0341 | 0/0 |
| html | fidelity | 76 | 0.9325 | 0.7872 (text-level-320-light-fidelity) | 0.0304 | 4/4 |
| svg | fidelity | 40 | 0.9627 | 0.9112 (svg-lineargradient-320-dark-fidelity) | 0.0204 | 0/0 |
| tailwind-v4 | fidelity | 8 | 0.9484 | 0.8748 (gradients-390-dark-fidelity) | 0.0272 | 0/0 |

Exceptions (exempt from family floors and the 1.0 component target; the 0.005 drop rule still applies):

- `motion-unmapped-320-light-fidelity`: the unmapped background-position shimmer is the fixture's purpose: Chrome is captured with the gradient at its settled keyframe position, native draws the static authored gradient (unmapped motion) — owner: @raelsei
- `motion-unmapped-390-light-fidelity`: the unmapped background-position shimmer is the fixture's purpose: Chrome is captured with the gradient at its settled keyframe position, native draws the static authored gradient (unmapped motion) — owner: @raelsei
- `shadcn-field@app`: items below the first input drift 0.5–1 pt down and the text is lighter — SwiftUI rounds the fractional CSS line boxes (19.25 pt labels, 21 pt descriptions) and the 32 pt field to the pixel grid, and Chrome rasterises the text heavier (the pinned fidelity captures score 0.938–0.949 too) — owner: @raelsei
- `tw-cards-320-dark-app`: card descriptions wrap one word earlier ("members / and deploys.", "open / pull requests.") and the light-on-dark text is lighter — iOS native line breaking avoids a one-word last line (app mode keeps native breaking), and Chrome rasterises light-on-dark text heavier (the light captures pass) — owner: @raelsei
- `tw-cards-390-dark-app`: card descriptions wrap one word earlier and the light-on-dark text is lighter — iOS native line breaking avoids a one-word last line (app mode keeps native breaking), and Chrome rasterises light-on-dark text heavier (the light captures pass) — owner: @raelsei
<!-- /quality-summary -->

Of 678 `app` and 626 `fidelity` captures, 542 and 428 reach SSIM ≥ 0.95; 630 and 586
reach ≥ 0.90 (`jq '[.[] | select(.mode == "app" and .ssim >= 0.95)] | length'` over the baseline).
Read the table with these limits:

- Every `<family>@<mode>` has a regression floor in
  `tests/conformance/visual-policy-{ios,mac}.json` (`families`), raised by `bun run quality --ratchet`
  on each reviewed rebaseline and never lowered. The gate also fails a capture that drops more than
  0.005 below its baseline or misses an anchor.
- `<case>-390-<theme>-app@open:<layer>` captures check each in-flow layer open: Chrome's page with the trigger
  clicked against the view initialised with `is<Name>Expanded: true`; they count toward their family floor. Menus
  have no `@open` capture: their popup is native, so only the closed trigger is compared.
- Captured uniform Menlo text uses Menlo on iOS. Other installed monospace faces, `ui-serif` and
  `ui-rounded` can still differ from the native generic designs, which depresses the `font-family` scores.

The LayoutDoc 5 font-selection change was first reviewed in the focused iOS component run in
`tests/conformance/baselines/components-v3-ios.json`: 358 captures (198 app, 160 fidelity), no errors.
Its six `overlay-collapsible@app` captures score 0.9897–0.9957; all five Menlo exceptions are removed
and that feature's floor is ratcheted to 0.98. The full-corpus baseline above now includes these
fixes and the greedy-wrapping follow-up; the focused runs remain available for comparison.

The greedy-wrapping follow-up removes the two narrow `shadcn-item@app` exceptions. Its eight-capture
run is tracked in `tests/conformance/baselines/text-wrapping-v3-ios.json`; app scores are
0.9688–0.9791 and the feature floor is 0.96. A full 358-capture run found two wide-title regressions
from fractional normalization; clamped titles retain their native line-count box, with all four
affected component cases rerun. Fractional normalization applies to iOS; macOS keeps its native
pixel-rounded paragraph boxes so adjacent controls and subsequent content retain their alignment.
`quality --ratchet ... --features-only` raises a scoped feature floor without deriving unrelated family floors from a partial run.

Every pull request also runs the macOS gate (`tests/conformance/baselines/visual-{pilot,all}-mac.json`, rendered
with `ImageRenderer` on macOS): the same per-capture 0.005 drop rule, anchors and family floors, plus the same-code
resize check (390-compiled code rendered at 320 and 768 px against fresh Chrome captures, `reflowMaxLoss`). Over all
fixtures (`--all --reflow`), each `fixtures/breakpoints/` page's merged breakpoint view is also rendered at its band
widths and at T−1/T of every CSS width threshold (`<case>-<width>-<theme>-app@bp`, `breakpointMaxLoss` 0.01 at band
capture widths, `reflowMaxLoss` at the others). macOS draws text at different heights than iOS, so its absolute
numbers are a regression signal, not the support claim.

Features outside this table may work but are not claimed; every captured feature is reported as
mapped, approximated or unmapped in `diagnostics`.

## Verified behaviour

- Static accessibility parity on every pull request: every node Chrome's accessibility tree names in the pilot
  fixture set keeps its role and name in the converted view, with no exceptions (`tests/conformance/ax-parity.test.ts`).
- iOS behaviour suite (`bun run test:ios-behaviour`, 34 cases in the iOS simulator — 19 curated component fixtures,
  the 13 overlay fixtures, a `pointer-events: none` tap-through case and a breakpoint page — on `v*` tags, weekly and
  on dispatch): the accessibility tree, Apple's
  accessibility audit (Dynamic Type, clipped text, element descriptions, traits; hit regions are reported, not
  failing), Dynamic Type at xSmall, large and AX5 plus the root height at AX3 against Chrome scaled to AX3,
  right-to-left mirroring, interaction (toggles, text fields, pickers and every action closure is called), and motion:
  an animated view moves on its live clock, and under Reduce Motion it moves only when something should still move
  (see Motion); a text field's transitioned focused look arrives, with and without Reduce Motion. 2.0 interactions:
  every disclosure opens and closes from its trigger; every drawn presentation opens (long-press for hover cards),
  sits in a modal container when modal, closes from each of its closers and from an outside tap where the design
  allows one, and its buttons' actions
  are called; every native menu item's action is called; the breakpoint view switches bands while a typed text and a
  toggled switch keep their values.
- 2 known audit issues are accepted and listed with their reasons in `tests/conformance/ios-behaviour.json`, both
  outside the converter's reach: a text field whose value the audit reports as clipped in any stock `TextField`, and one
  e-mail address whose label is the address itself (the design gives no other description).

## Pinned geometry

In `app` mode these patterns keep the captured pixel geometry instead of reflowing, and say so in
`diagnostics` (one quoted note each):

- Flex-wrap outside both the native-wrap subset (which holds `fit-content`/`max-content` items at their captured
  width) and the `MarkswiftFlexRow` subset below: `approximated flex-wrap: flex-wrap flex grow allocation → captured child positions; cannot reflow at another size`.
  `MarkswiftFlexRow` admits a wrapping row when CSS line breaking and per-line allocation reproduce its captured lines
  (in a box as tall as its lines, `justify-content` start); app mode re-breaks and re-allocates every line.
- Unequal flex growth outside the `MarkswiftFlexRow` subset (unequal grow, px/0/%/content bases and shrink with CSS's
  freeze loop, px min/max-width clamps, `align-self` start/center/end/stretch, and the automatic minimum of an
  overflowing row's unbreakable items; admitted when its solver reproduces Chrome, a second capture at 320 px confirms
  it): `approximated flex-grow: unequal measured widths [146,146,300] (basis, shrink or content constraints); measured width pinned`.
  Column growers as tall as their content took no free space and hug it.
- Grids outside the `MarkswiftTracks` subset (`fr`, `minmax(px, fr)`, `auto`, px, `repeat(auto-fill|auto-fit, minmax(px, 1fr))`
  or one implicit `auto` column; line, negative-line, `span <n>` and named-area placement inside the explicit
  columns; `auto`/px rows and one `grid-auto-rows` value; `justify-self`/`justify-items`) whose items overlap, use
  template line names or implicit columns, flow by column or densely, or run right-to-left: `approximated display: grid: captured grid placement preserves holes, spans and alignment; responsive track recalculation is not reconstructed`.
- Inline-block rows: `approximated display: inline-block: inline-block items → rows of the captured line division; they do not re-wrap at another width`.
- Tables outside the `MarkswiftTable` subset (right-to-left, `visibility: collapse`, anonymous rows or cells, a separated table whose rows paint, a row or row group with `onclick`, a `role`, `aria-*` or `tabindex`, cells off the column/row lattice): `approximated table: <table> → measured rows/cells; shared column resizing, spanning semantics and table accessibility are not translated`.
- Auto-layout tables (`MarkswiftTable`): `approximated table-layout: auto table layout → captured column widths scale with the offered width; CSS min-/max-content column sizing is not reproduced`.
- Percentage relative offsets: `approximated position: relative: left 10% → offset pinned at 34.3px`.

Absolutely and fixed-positioned boxes attach to the corner CSS anchored them to, with their
captured size and offset; fixed boxes stay outside the page's scroll view.

## Motion

CSS `@keyframes` animations play in `app` output through `MarkswiftAnimation` (`MarkswiftRuntime.swift`): opacity,
translate (px and `%` of the box), scale and rotate, with CSS timing — delay (negative too), fractional and infinite
iterations, direction, fill mode and per-keyframe `cubic-bezier()`/`steps()`/`linear()` easing — on a `TimelineView`
clock that stops once every one-shot has ended. Under Reduce Motion the author's `prefers-reduced-motion` rules win;
without them decorative loops stop at their rest look and one-shot animations lose their movement while their opacity
keeps its timing; status indicators (`role="status"`/`progressbar`, `aria-busy="true"`) keep turning. `fidelity`
output renders the settled look. The visual gate also seeks both sides: `<case>-390-<theme>-app@t:<ms>` captures pause
Chrome's animations and the native view at the same time (`@reduced@t:<ms>` under Reduce Motion; times from the
fixture's `markswift-motion` metas) and score them in the `motion@app` family.

Pressed and focused looks animate with the browser's own per-direction transition (duration, delay, easing; only the
transitioned properties). Mid-flight colours use SwiftUI's interpolation (endpoints exact), and an
interrupted transition reverses the SwiftUI way; the gate checks parameters and endpoints, not mid-flight frames
(D-MOTION). Under Reduce Motion without an author rule, scale/translate changes jump and fades remain.

Drawn overlays (dialogs, sheets, popovers, hover cards) enter with their CSS keyframes — the same `MarkswiftAnimation`,
starting when the layer is inserted — and leave with their exit keyframes as a removal transition with the exact
curve; the gate scores the enter at ½ its duration (`<case>-390-<theme>-app@open:<layer>@t:<ms>`, times from the
fixture's `markswift-motion-open` meta) and checks the exit's parameters, not its frames. Accordion, collapsible and
`<details>` content grows and shrinks with its CSS `height` animation (`MarkswiftReveal`: following content moves
with it). Native menus and tooltips use the system animation. Under Reduce Motion enter and exit drop their movement
and keep their opacity timing (D-MOTION); author `prefers-reduced-motion` rules for overlay enter/exit are not
captured (a capture warning says so).

## Not translated

- JavaScript behaviour and business logic; scripts only run in Chrome during capture.
- Height and orientation media queries (reported; landscape is a wider width band), and width breakpoints without
  `--breakpoints` (one viewport and one layout per capture). With it, CSS width media queries switch the view at the
  root's proposed width and container queries switch at the container's width (stack and grid containers; height,
  style and scroll-state queries are reported); a fixed-width root gets no breakpoints, and script-driven DOM
  differences are emitted once per band.
- States other than pressed, focused and open: paint-only pressed and focused deltas *are* captured, and so is the
  open state of a `<details>`, collapsible, accordion item, dialog, sheet, popover, hover card or menu (app mode);
  hover-only states other than tooltips (`.help`) and hover cards (long-press), and disabled, validation, checked and
  `data-state` variants are not.
- Swipe-to-dismiss and system presentation chrome: dialogs and popovers are drawn inside the component's frame (app
  mode), with no collision flip, scroll lock or focus trap beyond VoiceOver's modal containment, and placed as
  captured for the active width band. Menus, menubars and selects open native popups with their captured items (app
  mode), including nested submenus. The CSS look of the open list, shortcut text and item icons are not drawn,
  and a menu trigger has no tap action of its own; tooltips are described below.
- Tooltips are never drawn: `title` and captured tooltips (Radix/shadcn tooltip, `interestfor`) become `.help(…)`
  (shown with a pointer on iPad and Mac) and a VoiceOver hint; nothing visible on iPhone.
- Scroll-driven animations, keyframed colours/shadows/filters/layout properties, `@starting-style` and script
  animations (reported).
- Sticky pinning while scrolling (`position: sticky` stays at its rest position, reported).
- `<select multiple>` and `<datalist>`.
- Inline handlers on non-link elements inside running text (`<span onclick>`): they stay styled text and are reported.
- Installed monospace faces other than captured Menlo still use the native monospaced design (reported).

## Known gaps

- 6 of the 198 `components@app` iOS captures remain listed exceptions (see the block above): fractional line boxes
  rounded to the pixel grid and iOS native line breaking that avoids a one-word last line.
- System-font width and variation requests use exact CoreText axes when the installed face exposes them, clamped to
  its ranges; unrecognized axes remain diagnosed and unavailable axes are ignored. LayoutDoc 5 retains `@font-face`
  stretch descriptors for width selection. Paragraph `unicode-bidi: plaintext`, isolated list/disclosure markers,
  nested single-scheme `color-scheme`, and pointer-enabled descendants of pass-through overlays are translated.
  Transparent controls retain their actions even when hidden from accessibility.
- Relative offsets are measured in Chrome, including percentage-height and stretched containing blocks, and stay
  pinned at those measured pixels. Inline text and generated pseudo-element offsets move paint without changing line layout.
- Inline generated images (`content: url()`, inside `list-style-image`) scale with their text under Dynamic Type.
  Standalone generated images scale with their pseudo-element’s font as well. Outside counter markers align their
  trailing edges, so unequal marker widths no longer prevent otherwise matching list rows from becoming a `ForEach`.
- Native tables (`MarkswiftTable`): cells read in DOM order and `<th>` announces as a header, but VoiceOver table navigation (row/column position, header association) is not translated (`approximated table` on every admitted table).
- Layout: percentage 2D translations and SVG cover/contain images follow their rendered box in app mode;
  percentage translations in flattened 3D transforms remain captured geometry.
- Overlay discovery is bounded to 12 triggers. Nested triggers replay their ancestors; repeated rows retain their
  actions, and supported percentage/calc dialog widths follow the offered width. Fresh `--breakpoints` conversions
  capture layers per width band; changed layers conservatively select the whole band root.
- Accessibility: the 2 known audit issues above; hit-region findings are reported, not failing.

## Diagnostics

The CLI prints one `Warning: [<component>] <level> <feature>: <message>` line per warning (resources, fonts,
viewport-dependent CSS, light/dark pairing, palette; each bracketed or leading part only when set) and one `Note <level>
<feature>: <message> [<nodes>]` line per distinct loss, unmapped first. In the library each
`diagnostics` entry is a node (`id`, `kind`, `confidence`) with its losses
`{ level: "approximated" | "unmapped", feature, message }`, where `feature` is a row id of the
conformance inventory (`tests/conformance/inventory/`), for example `font-family` or
`display: grid`.

## Security

Capture runs the input in Chrome, including its scripts: convert trusted local inputs only.
For pasted markup, `convertHtml(html, { untrustedInput: true })` blocks page scripts, outbound
requests and DNS resolution in the capture browser and rejects file/URL sources, `assetsDir` and
`baseURL`; inline CSS and data-URL assets still work. Host that browser in an isolated environment
too. Outside this mode `@font-face` bytes are fetched over `http(s)` only, up to 25 MB per file.

## Playground

```sh
bun run --cwd playground dev   # http://127.0.0.1:4317
```

A local HTML/CSS → SwiftUI workbench; pasted markup uses the untrusted-input policy. Deployment of
the static frontend and the conversion service: `playground/README.md`.

## Development

```sh
bun install --frozen-lockfile
./node_modules/.bin/playwright-core install --no-shell chromium   # pinned Chromium for the visual gate
bun run lint && bun run typecheck && bun run test
bun run test:browser     # Chrome integration and conformance tests
bun run test:native      # Xcode: compile and macOS-render generated Swift
bun test playground/tests
bun run test:ios-behaviour   # iOS simulator: accessibility audit, Dynamic Type, RTL, interaction
bun run pilot --renderer mac --out tests/conformance/out/<dir>   # add --all for every fixture, --reflow for 320/768
bun run quality tests/conformance/baselines/visual-pilot-mac.json tests/conformance/out/<dir> tests/conformance/visual-policy-mac.json
MARKSWIFT_SIMULATOR='iPhone 17' bun run pilot --renderer ios --all --out tests/conformance/out/<dir>   # iOS renderer
# iOS breakpoint evidence: `@bp` captures render on an iPad simulator (create it once with
# `xcrun simctl create "iPad Pro 13-inch (M5)" com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB com.apple.CoreSimulator.SimRuntime.iOS-27-0`)
MARKSWIFT_SIMULATOR='iPhone 17' MARKSWIFT_SIMULATOR_IPAD='iPad Pro 13-inch (M5)' bun run pilot --renderer ios --all --reflow --group breakpoints --out tests/conformance/out/<dir>
```

Baselines change only through `bun run quality --write-baseline <run-dir> <manifest.json>`,
reviewed and committed by hand. GitHub Actions workflows:

- `ci.yml` (pull requests, pushes to `main`, nightly): lint, typecheck, `test`, `test:browser`, `test:native`, the
  package build with the npm smoke test, and the conformance pilot (capture, both modes, iOS typecheck).
- `visual.yml`: the macOS gate on pull requests and pushes to `main` (pilot scope, with the 320/768 resize check)
  and nightly (all fixtures); the iOS renderer over all fixtures on `v*` tags and manual dispatch only. Dispatch it
  with `renderer`, `scope` and `rebaseline` to produce a candidate baseline. A separate iOS breakpoint job runs on
  every trigger, including pull requests: `--all --reflow --group breakpoints`, with wide `@bp` captures on the iPad,
  gated against `visual-breakpoints-ios.json`. Its run and optional candidate baseline are uploaded separately.
- `behaviour.yml` (`v*` tags, weekly, dispatch): `bun run test:ios-behaviour`.
- `release.yml` (`v*` tags): after approval in the `npm` environment, checks that the tag equals
  `v<package version>`, runs lint, typecheck, `test`, the build and the npm smoke test, and publishes with provenance
  through npm trusted publishing (OIDC; no npm token is stored).
- `pages.yml` (pushes to `main` that touch `site/`, dispatch): builds the Astro docs site in `site/` and deploys it to
  GitHub Pages. Locally: `cd site && bun install && bun run dev`.

| Path | Responsibility |
| --- | --- |
| `src/cli.ts`, `src/cli/` | Argument parsing, bundle writing, exit codes |
| `src/api/` | Public conversion options and resource lifecycle |
| `src/input/` | HTML sources, root selection and node identity |
| `src/html/` | Element registry (`HTML_ELEMENTS`, `classifyElement`) and input-type routing |
| `src/browser/` | Chrome capture, computed styles, images and fonts |
| `src/model/` | Serializable layout, semantic and font contracts |
| `src/css/` | Pure CSS value parsers |
| `src/analysis/` | Geometry, sizing, flow, text, controls and SVG inference |
| `src/compiler/` | Synchronous measured layout → Swift compilation |
| `src/swift/` | Swift layout, paint, text, controls, tokens and runtime generation |
| `src/fonts/` | Font metadata, packaging and Python conversion |
| `tests/` | Unit, architecture, integration and conformance (fixtures, inventory, baselines) suites |
| `tools/verify/`, `tools/quality.ts` | Swift typecheck, native rendering, image comparison and the visual gate |
| `playground/` | Local workbench and the separately deployable conversion service |
| `site/` | Documentation site (Astro, GitHub Pages) |

## Roadmap after 2.0

- Looser extraction: optional children, variants, `ForEach` over grid cells.
- Break characters (zero-width space, soft hyphen); `TextRenderer` justify and decorations.
- Validation and `data-state` variants; iPad hover and keyboard.
- Overlays: swipe-to-dismiss and an opt-in native `.sheet` for bottom drawers; menu item icons and shortcut text.
- Motion: scroll-driven animations; mid-flight frame gates for state transitions; author `prefers-reduced-motion`
  rules for overlay enter/exit.
- Height and orientation media queries; sticky pinning while scrolling.
- The rest of the flex algorithm: `min-width: auto` as min-content for breakable content, column allocation in a
  definite height, `align-content` distribution.
- `<select multiple>`, `<datalist>`.
- Linux capture; a compiled binary and Homebrew; no Python dependency for fonts; a capture cache; a shared browser
  for single conversions; browser-response font bytes; static variable-font instances (smaller font bundles).
- Remote image download, @2x images and asset catalogs.
- Sharded iOS visual runs; body re-evaluation and scroll-hitch benchmarks.
- A Compose target over the target-independent IR.

## License

MIT — see [LICENSE](LICENSE).
