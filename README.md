# Markswift

Convert rendered HTML and CSS into SwiftUI source.

**Alpha (0.1.0-alpha.1).** One component per conversion. The output is
**visually faithful starting code, not a reusable component**: it reproduces one captured state of one component, with no
parameters, no `ForEach` over repeated content and generated (not meaningful) names. Expect to
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
| `<Name>.swift` | Always: the view, with a light and a dark `#Preview` |
| `<Name>+Tokens.swift` | Always: colours in `<Name>.Palette` |
| `MarkswiftRuntime.swift` | Always: shared helpers; its header names the Markswift version, and every conversion by that version produces the identical file |
| `<Name>+Shapes.swift` | When SVG or clip shapes exist |
| `<Name>+Fonts.swift`, `<Name>+UIAppFonts.plist.fragment`, `Fonts/*.ttf` | When webfonts were bundled |
| `Images/<hash>.<ext>` | When the component shows raster images (one file per distinct image) |
| `.markswift.json` | Always: what this run wrote (for `--update`) |

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
  System and custom fonts scale with Dynamic Type (`@ScaledMetric`, `relativeTo:`); text-bearing
  controls treat their measured height as a floor; pages taller than the viewport scroll.
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

## Adding the output to Xcode

Add **all** generated `.swift` files to one target. For webfonts add `Fonts/` as resources and
either merge `<Name>+UIAppFonts.plist.fragment` into the app's Info.plist or call
`<Name>.BundledFonts.register(in:)` with the resource bundle before rendering. Add `Images/` as
resources; inside a Swift package set `MarkswiftAssets.bundle = .module` once at startup.

Several conversions can share one target: every per-view declaration (palette, shapes, bundled
fonts) is nested in the view's type and its files are prefixed with the view name. Add
`MarkswiftRuntime.swift`, each `Fonts/` file and each `Images/` file once. When you upgrade
Markswift, replace the runtime and re-convert older screens. A shared runtime package is post-alpha.

## Supported subset (evidence)

Numbers come from the tracked macOS baseline `tests/conformance/baselines/visual-all-mac.json`:
724 captures (every conformance fixture at 320 and 390 px, light and dark where the fixture has
both, in both modes), captured 2026-10-11 from source revision `754b720` with Playwright's pinned
Chromium 153 and rendered by macOS 27.0.1 `ImageRenderer`. The metric is colour SSIM (minimum
over R, G and B, at 1×, both images decoded to sRGB) plus pixel mismatch and element-region anchors. Regenerate the table with
`bun run quality --summary tests/conformance/baselines/visual-all-mac.json` (which also prints the
per-fixture table):

| domain | mode | n | mean ssim | min ssim | mean mismatch | anchors ok |
|---|---|---|---|---|---|---|
| attribute | app | 14 | 0.7226 | 0.5420 (attr-dir-320-light-app) | 0.0394 | 0/0 |
| css-layout | app | 52 | 0.7698 | 0.5072 (float--left-320-light-app) | 0.0407 | 16/16 |
| css-misc | app | 8 | 0.7970 | 0.7351 (cursor-390-light-app) | 0.0225 | 0/0 |
| css-paint | app | 80 | 0.7636 | 0.4790 (border-top-width-390-light-app) | 0.0500 | 12/12 |
| css-typography | app | 100 | 0.7583 | 0.4234 (text-align--justify-320-dark-app) | 0.0301 | 0/0 |
| html | app | 60 | 0.7119 | 0.4054 (input-390-dark-app) | 0.0641 | 4/4 |
| svg | app | 40 | 0.8387 | 0.7633 (svg-use-320-dark-app) | 0.0253 | 0/0 |
| tailwind-v4 | app | 8 | 0.9472 | 0.8733 (gradients-390-dark-app) | 0.0256 | 0/0 |
| attribute | fidelity | 14 | 0.9409 | 0.8480 (attr-alt-320-light-fidelity) | 0.0091 | 0/0 |
| css-layout | fidelity | 52 | 0.9752 | 0.8285 (float--left-320-light-fidelity) | 0.0044 | 16/16 |
| css-misc | fidelity | 8 | 0.9617 | 0.9322 (pointer-events--none-390-light-fidelity) | 0.0047 | 0/0 |
| css-paint | fidelity | 80 | 0.9542 | 0.9039 (list-style-type-320-dark-fidelity) | 0.0113 | 12/12 |
| css-typography | fidelity | 100 | 0.9143 | 0.6334 (font-family-320-dark-fidelity) | 0.0107 | 0/0 |
| html | fidelity | 60 | 0.9205 | 0.7351 (text-level-320-light-fidelity) | 0.0111 | 4/4 |
| svg | fidelity | 40 | 0.9698 | 0.9116 (svg-lineargradient-320-dark-fidelity) | 0.0045 | 0/0 |
| tailwind-v4 | fidelity | 8 | 0.9472 | 0.8733 (gradients-390-dark-fidelity) | 0.0256 | 0/0 |

Of 362 captures per mode, 37 `app` and 209 `fidelity` captures reach SSIM ≥ 0.95; 60 and 315
reach ≥ 0.90 (`jq '[.[] | select(.mode == "app" and .ssim >= 0.95)] | length'` over the baseline).
Read the table with these limits:

- **No feature is approved at an absolute floor yet.** `tests/conformance/visual-policy-mac.json`
  has `"features": {}`; the gate fails a capture that drops more than 0.005 below its baseline or
  misses an anchor. Box-shadow, approved in an earlier greyscale pilot, is not re-approved: its
  `app` captures sit below 0.95 (see the per-fixture table).
- macOS rounds line heights to whole points, which depresses `app`-mode text scores; the iOS
  runtime is authoritative for text. No iOS baseline exists yet: it is produced by the Visual
  workflow (`workflow_dispatch`, renderer `ios`) on a machine with an iOS Simulator runtime.
- `ImageRenderer` cannot rasterise UIKit/AppKit controls, so the control fixtures (`input`,
  `select`, `progress`, …) are not visually meaningful in these numbers (the iOS renderer draws
  them; see the iOS baseline once plan 021 lands).

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
