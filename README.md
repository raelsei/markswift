# Markswift

Convert rendered HTML and CSS into SwiftUI source.

**Alpha (0.1.0-alpha.1).** One component per conversion. The output is
**visually faithful starting code, not a reusable component**: it reproduces one captured state of one component, with no
parameters and generated (not meaningful) names. In `app` mode repeated sibling elements become one nested `<Name>View`
subview plus a `static let` data array iterated with `ForEach` (pixel-identical to the unrolled view). Expect to
refactor it. Generated code targets iOS 18+ and Swift 6. Unsupported or approximated features are
always reported (see [Diagnostics](#diagnostics)).

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
(default `app`), `--css <file>`, `--url <url>`. Exit status: 0 converted, 2 invalid options or hand-edited files
refused by `--update`, 1 conversion or file error. Warnings and diagnostics go to stderr.

## What you get

| File | When |
| --- | --- |
| `<Name>.swift` | Always: the view with an explicit `init`, a light and a dark `#Preview`, plus `extension <Name>` with extracted row types, data, subviews and one `#Preview` per subview when the design repeats sibling elements |
| `<Name>+Tokens.swift` | Always: colours in `<Name>.Palette` |
| `MarkswiftRuntime.swift` | Always: shared helpers; its header names the Markswift version, and every conversion by that version produces the identical file |
| `<Name>+Shapes.swift` | When SVG or clip shapes exist |
| `<Name>+Fonts.swift`, `<Name>+UIAppFonts.plist.fragment`, `Fonts/*.ttf` | When webfonts were bundled |
| `Images/<hash>.<ext>` | When the component shows raster images (one file per distinct image) |
| `.markswift.json` | Always: what this run wrote (for `--update`) |

## Components

Repeated sibling elements (app mode) become a row type `<Type>`, a subview `<Type>View` and a data array `<types>`
(`static let`, the design's rows) iterated with `ForEach`. The screen always has an explicit `init` whose parameters
all default to the design, in this order: data arrays, annotated fields, actions:

```swift
TeamCard()                                                        // the design as captured
TeamCard(members: team, title: "Crew", onMessage: { router.chat($0.id) })
```

- Per-row buttons collapse into one `on<Name>: (<Type>) -> Void` that receives the tapped row; other actions are `() -> Void`.
- State: rows with controls are owned by the screen as `@State` seeded through `init`; the subview takes `@Binding var <type>: <Type>`.
  Grids and measured, wrapping or distributed stacks call the subview per element from `Self.<types>[i]` and are not parameters.
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
listed file was edited by hand it refuses with exit 2 and names the file (`--force` discards those edits); an unlisted
file in the way of a new generated file is always refused. Customise through the component's initializer, `extension`s
and wrappers in your own files, and commit the output directory including `.markswift.json`.

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
  recompiles a saved `LayoutDoc` (version 3) without Chrome; it does not package fonts. A saved `LayoutDoc` is a
  cache, not an interchange format: Markswift compiles only the LayoutDoc version it captures (`LAYOUT_DOC_VERSION`)
  and rejects any other with an error naming both versions — recapture the source. A change to the captured style
  list or the schema bumps the LayoutDoc version and is a breaking release.
- Options: `name`, `mode` (`app` | `fidelity`), `theme` (`adaptive` | `light` | `dark`),
  `darkClass`, `css` (compiled CSS), `root` (default `[data-markswift-root]`, otherwise `body`),
  `viewport` (default 390 × 844), `dpr` (default 1), `waitFor`, `prepare(page)`,
  `untrustedInput`, `timeoutMs` (default 120000 ms for the whole conversion).
- Result: `code`, `files` (every Swift source), `assets` (fonts and images), `diagnostics`,
  `warnings` (`{ source, level?, feature?, component?, message }[]`: page and resource errors, viewport-dependent CSS
  the view does not follow, font packaging, light/dark pairing), `layout` and, for adaptive conversions, `darkLayout`.

## Modes

- `app` (default) is the product: native stacks, grids and `Text` with native line breaking.
  System and custom fonts scale with Dynamic Type (`@ScaledMetric`, `relativeTo:`) and boxes grow
  with their text: a measured or authored height on anything that lays out text (text, stacks,
  grids, text-bearing controls) is a floor, measured layouts move what lies below a grown child,
  hugging label columns fit their text instead of a pinned width, and text editors size to their
  text. Pages taller than the viewport scroll.
  CSS `line-height` uses `.lineHeight(.multiple(…))` on iOS 26+ (exact line boxes, tight leading
  compresses) and `.lineSpacing` on iOS 18–25 (`MarkswiftRuntime.swift`, `markswiftLineHeight`).
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
Markswift, replace the runtime and re-convert older screens. A shared runtime package is post-alpha.

## Building a component library (markswift build)

`markswift build [markswift.json] [--force]` captures every component of a config in one browser session and writes
ONE local Swift package. Paths are relative to the config file; `serve` (default: the config's directory) is served
over `http://127.0.0.1` so relative URLs such as `../assets/geist.woff2` resolve inside it. `root`, `viewport`,
`theme`, `darkClass`, `mode`, `css` and `waitFor` apply to every component; a component may override any of them.
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
924 captures (every conformance fixture at 320 and 390 px, light and dark where the fixture has
both, in both modes), captured 2026-10-11 from source revision `274c6e1` with Playwright's pinned
Chromium 153 and rendered on the iOS runtime (`iPhone 17 com.apple.CoreSimulator.SimRuntime.iOS-27-0`,
`UIHostingController` + `drawHierarchy`). The `components` family is 25 shadcn/ui and Tailwind
components (`tests/conformance/fixtures/components/`) compiled offline with Tailwind 4.1. The metric
is colour SSIM (minimum over R, G and B, at 1×, both images decoded to sRGB) plus pixel mismatch and
element-region anchors. The block below is generated by
`bun run quality --readme tests/conformance/baselines/visual-all-ios.json tests/conformance/visual-policy-ios.json`
(a test fails when it is stale); `bun run quality --summary <manifest.json>` also prints the
per-fixture table, e.g. for the per-PR macOS numbers in
`tests/conformance/baselines/visual-all-mac.json`.

<!-- quality-summary tests/conformance/baselines/visual-all-ios.json -->
| domain | mode | n | mean ssim | min ssim | mean mismatch | anchors ok |
|---|---|---|---|---|---|---|
| attribute | app | 14 | 0.9534 | 0.8576 (attr-alt-320-light-app) | 0.0188 | 0/0 |
| components | app | 100 | 0.9156 | 0.4877 (shadcn-accordion-320-dark-app) | 0.0213 | 0/0 |
| css-layout | app | 64 | 0.9828 | 0.8424 (display--contents-320-light-app) | 0.0111 | 16/16 |
| css-misc | app | 12 | 0.9687 | 0.9352 (animation-name-390-dark-app) | 0.0189 | 0/0 |
| css-paint | app | 80 | 0.9541 | 0.7061 (content-320-dark-app) | 0.0209 | 12/12 |
| css-typography | app | 100 | 0.9305 | 0.5713 (word-break-320-dark-app) | 0.0289 | 0/0 |
| html | app | 60 | 0.9273 | 0.7571 (input-320-dark-app) | 0.0273 | 4/4 |
| svg | app | 40 | 0.9761 | 0.9326 (svg-lineargradient-320-dark-app) | 0.0164 | 0/0 |
| tailwind-v4 | app | 8 | 0.9491 | 0.8750 (gradients-390-dark-app) | 0.0269 | 0/0 |
| attribute | fidelity | 14 | 0.9361 | 0.8417 (attr-alt-320-light-fidelity) | 0.0243 | 0/0 |
| components | fidelity | 100 | 0.9412 | 0.4874 (shadcn-accordion-320-dark-fidelity) | 0.0166 | 0/0 |
| css-layout | fidelity | 64 | 0.9777 | 0.9290 (visibility-320-light-fidelity) | 0.0135 | 16/16 |
| css-misc | fidelity | 12 | 0.9545 | 0.9312 (pointer-events--none-390-light-fidelity) | 0.0237 | 0/0 |
| css-paint | fidelity | 80 | 0.9521 | 0.8923 (list-style-type-320-dark-fidelity) | 0.0236 | 12/12 |
| css-typography | fidelity | 100 | 0.9201 | 0.6544 (font-family-320-dark-fidelity) | 0.0336 | 0/0 |
| html | fidelity | 60 | 0.9208 | 0.7662 (text-level-320-light-fidelity) | 0.0306 | 4/4 |
| svg | fidelity | 40 | 0.9627 | 0.9112 (svg-lineargradient-320-dark-fidelity) | 0.0204 | 0/0 |
| tailwind-v4 | fidelity | 8 | 0.9484 | 0.8748 (gradients-390-dark-fidelity) | 0.0272 | 0/0 |
<!-- /quality-summary -->

Of 462 captures per mode, 299 `app` and 274 `fidelity` captures reach SSIM ≥ 0.95; 401 and 410
reach ≥ 0.90 (`jq '[.[] | select(.mode == "app" and .ssim >= 0.95)] | length'` over the baseline).
Read the table with these limits:

- Every `<family>@<mode>` has a regression floor in
  `tests/conformance/visual-policy-{ios,mac}.json` (`families`), raised by `bun run quality --ratchet`
  on each reviewed rebaseline and never lowered. The gate also fails a capture that drops more than
  0.005 below its baseline or misses an anchor.
- Chrome renders `ui-monospace`, `ui-serif` and `ui-rounded` with other faces than iOS (SF Mono,
  New York, SF Rounded), which depresses the `font-family` scores.

Features outside this table may work but are not claimed; every captured feature is reported as
mapped, approximated or unmapped in `diagnostics`.

## Pinned geometry

In `app` mode these patterns keep the captured pixel geometry instead of reflowing, and say so in
`diagnostics` (one quoted note each):

- Flex-wrap outside the native-wrap subset: `approximated flex-wrap: flex-wrap flex grow allocation → captured child positions; cannot reflow at another size`.
- Unequal flex growth: `approximated flex-grow: unequal measured widths [146,146,300] (basis, shrink or content constraints); measured width pinned`.
- Non-trivial grids (spans, holes, unequal or intrinsic tracks, overlap, RTL): `approximated display: grid: captured grid placement preserves holes, spans and alignment; responsive track recalculation is not reconstructed`.
- Inline-block rows: `approximated display: inline-block: inline-block items → rows of the captured line division; they do not re-wrap at another width`.
- Tables: `approximated table: <table> → measured rows/cells; shared column resizing, spanning semantics and table accessibility are not translated`.

Absolutely and fixed-positioned boxes attach to the corner CSS anchored them to, with their
captured size and offset; fixed boxes stay outside the page's scroll view.

## Not translated

- JavaScript behaviour and business logic; scripts only run in Chrome during capture.
- More than one viewport per capture (media queries are not reconstructed); interaction states other than pressed and focused (hover-only, disabled, validation, open/checked).
- Animations and transitions (captured at their end state, reported).
- Inline handlers on non-link elements inside running text (`<span onclick>`): they stay styled text and are reported.
- `ui-monospace` maps to a different native face (an explicit support boundary).

## Diagnostics

The CLI prints `Warning: …` lines (resources, fonts, light/dark pairing) and one `Note <level>
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
bun run pilot --renderer mac --out tests/conformance/out/<dir>   # add --all for every fixture
bun run quality tests/conformance/baselines/visual-pilot-mac.json tests/conformance/out/<dir> tests/conformance/visual-policy-mac.json
```

Baselines change only through `bun run quality --write-baseline <run-dir> <manifest.json>`,
reviewed and committed by hand. `.github/workflows/ci.yml` runs every suite and `visual.yml` the
visual gate on pull requests, pushes to `main` and nightly; dispatch Visual with `renderer`, `scope`
and `rebaseline` to produce a candidate baseline.

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

## Roadmap after alpha

- Component extraction: parameters, `ForEach` over repeated siblings, meaningful names.
- Multi-component linker: one runtime and token set shared across conversions.
- Responsive flex/grid reflow, including unequal growth and grid tracks.
- Box-shadow rendering cost (one offscreen pass per shadow).
- No paint for content invisible at rest (for example `opacity: 0` overlays).
- Variable-font named/static instances beyond `wght`/`opsz`.
- A Compose target over the target-independent IR.
- Release visual numbers from the iOS runtime.

## License

MIT — see [LICENSE](LICENSE).
