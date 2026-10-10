# Markswift

Convert rendered HTML and CSS into SwiftUI source. **Experimental:** common UI patterns work,
but complex layout and typography still have visible limitations. This is a development repository, not an npm release.

## Start locally

Requirements: Bun (tested with 1.4.3) and installed Google Chrome. Custom webfonts additionally
require `python3` with `fontTools` and `brotli`. Xcode is needed to compile/test the generated
Swift, not to perform conversion. The generated code targets SwiftUI on iOS 18+.

```sh
bun install --frozen-lockfile
bun run lint        # Biome: formatting + correctness rules (bun run format rewrites)
bun run typecheck
bun run test
```

CI (`.github/workflows/ci.yml`) also runs `test:browser`, `test:native` and the conformance pilot on a macOS runner.

## Command-line conversion

The alpha CLI runs with Bun from this checkout; it does not require the playground API.
Give it a new output directory because one conversion produces several Swift sources and may
include font and image assets. An existing directory is never overwritten.

```sh
printf '%s\n' '<main data-markswift-root style="width:240px;height:80px;font:18px system-ui">Hello Markswift</main>' \
  | bun src/cli.ts convert - --name HelloCard --out ./generated/hello
bun src/cli.ts --help
```

The first command works without creating any input files. For your own files, run
`bun src/cli.ts convert ./path/to/page.html --out ./generated-page`; add
`--css ./path/to/compiled.css` only when you have a separate compiled stylesheet.
You can also capture a running site with
`bun src/cli.ts convert --url http://localhost:5173/card --root '#preview' --out ./generated-card`.
Choose a new output directory for each run.

The source can be a full HTML document, a fragment, stdin (`-`), or a running HTTP(S) page.
`--css` is optional and takes a **compiled** CSS file. Its relative `url()`s are resolved against the
CSS file and inlined as data URLs; root-relative (`/…`) URLs still resolve against the page.
File inputs resolve relative assets beside the HTML;
stdin is for self-contained markup and data-URL assets. `--width`, `--height`, `--theme`,
`--dark-class` and `--mode` select the captured state. Normal output prints the destination; warnings and
diagnostics go to stderr, one `Note` line per distinct loss (unmapped first) naming the nodes it
affects. Exit status is 0 for a completed conversion, 2 for invalid
command options, and 1 for a conversion or file error. Run `bun src/cli.ts convert --help` for
the complete option list.

Create a script in this checkout:

```ts
import { convertHtml } from "./src/index.ts";

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

console.log(result.code);
console.log(result.diagnostics, result.warnings);
for (const [path, content] of Object.entries(result.files)) {
  await Bun.write(`generated/${path}`, content);
}
for (const [path, bytes] of Object.entries(result.assets)) {
  await Bun.write(`generated/${path}`, bytes);
}
```

Add **all generated `.swift` files** to the same iOS target, not just `result.code`.
When fonts or images are returned, add the `Fonts/` and `Images/` folders as resources (folder
references keep the paths; plain groups also work). If the views live in a Swift package, set
`MarkswiftAssets.bundle = .module` once at startup. Merge `<View>+UIAppFonts.plist.fragment` into
the app's Info.plist, or call `<View>.BundledFonts.register(in:)` with the resource bundle before rendering.
Every per-view declaration (tokens in `<View>.Palette`, shapes, bundled-font registration) is
nested in the view's type and its files are prefixed with the view name, so several conversions
can share one target. `MarkswiftRuntime.swift` is identical for every conversion made by the same
Markswift version: add it to a target once, and replace it (re-converting older screens) when you
upgrade. Add each `Fonts/` file once; `Images/` files are named by content hash, so views share them.

## Inputs and output

```ts
import { convert, compileLayout } from "./src/index.ts";

await convert({ file: "./card.html" }, { name: "CardView" });
await convert({ html: "<main>...</main>", assetsDir: "./public" });
await convert({ html: "<main>...</main>", baseURL: "https://example.com/components/" });
await convert({ url: "http://localhost:5173/card" }, { root: "#preview" });

// Recompile an already measured layout without launching Chrome or running font packaging.
const result = compileLayout(savedLayout, { name: "CardView", mode: "app" });
```

- Full documents and fragments use the same API. Default root: `[data-markswift-root]`, otherwise
  `body`. Supply `root` to select a component. Fragment HTML keeps browser defaults; provide
  your reset CSS when needed.
- `css` accepts ordinary **compiled CSS**. Compiled Tailwind selectors and CSS Modules
  selectors work when their class names match the HTML. Bare utility classes do not provide
  styles by themselves. Raw JSX, CSS Modules imports and Tailwind build directives must run
  through the source project's build first; a dev-server URL is often the easiest input.
- `viewport` defaults to 390 × 844, `dpr` to 1, `theme` to `adaptive` (see below). Use `waitFor`
  for client-mounted content.
- `mode: "app"` emits native layout; `"fidelity"` aims at the captured geometry for visual
  comparison. One viewport is one observed state, not an inferred set of responsive rules.
- The result contains `code`, `files`, `assets` (fonts and raster images as `Images/<hash>.<ext>`,
  one file per distinct image), node `diagnostics`, resource/font
  `warnings`, the measured `layout` and, for adaptive conversions, `darkLayout`. Loaded images are
  embedded in the captured layout so generated code does not depend on a temporary local server.
  Unavailable images are reported; a loopback image URL (`127.0.0.1`, `localhost`) or an image
  without captured bytes is never emitted — the layer becomes a placeholder (or the `alt` text)
  with a diagnostic. Remote `http(s)` images load at runtime through `AsyncImage`.
- Each `diagnostics` entry is a node (`id`, `kind`, `confidence`) with what it lost:
  `{ level: "approximated" | "unmapped", feature, message }`, where `feature` is a conformance
  inventory row id (`font-family`, `display: grid`, `svg:use`, `img`), so reports group by feature.
- `timeoutMs` (default 120000, i.e. 120 s) bounds the whole conversion: browser, network and font
  conversion. A conversion that exceeds it rejects with `conversion timed out after <n> ms`.
- `compileLayout` accepts prepared `bundledFamilies` and `fontMetrics` for custom fonts.
  Without them it uses native system fonts and reports substitutions. It returns raster image
  `assets` too, but does not package fonts.
  Saved layouts must be `LayoutDoc` version 2; recapture older files.

**Light and dark.** By default (`theme: "adaptive"`, CLI `--theme adaptive`) Markswift captures the
page twice in the same browser session, with `prefers-color-scheme: light` and then `dark`, and emits
one view from the light capture. Every colour that differs between the two captures becomes a
`Color.markswift(light:dark:)` token in `<View>.Palette` (`<View>+Tokens.swift`; even a colour used once), so the view follows the
system appearance. Colours identical in both captures stay static tokens or inline literals.
Class-based themes (for example shadcn's `.dark`) need `darkClass: "dark"` (CLI `--dark-class dark`),
which adds that class to `<html>` for the dark capture; it is not auto-detected. Nodes or colour slots
that exist in only one theme, or whose geometry differs by more than 0.5px, keep their light values and
are reported in one `warnings` entry; the conversion never fails over them. The generated file has a
light and a dark `#Preview`. `theme: "light"` or `"dark"` captures a single theme.
`compileLayout(lightLayout, { dark: darkLayout })` does the same pairing without a browser.

HTML scripts execute in Chrome during capture. Use trusted local inputs; this API is not an
isolation boundary for hosting arbitrary uploads. Source JavaScript and navigation/business
logic are not translated into Swift application logic.

For a hosted paste-only converter, `convertHtml(html, { untrustedInput: true })` blocks page
scripts, outbound requests and DNS resolution in the capture browser. It rejects file/URL sources and
`assetsDir`/`baseURL`; inline CSS and data-URL assets remain usable. Host the browser process
in an isolated environment as well. Outside this mode, `@font-face` bytes are fetched by the host
over `http(s)` only, up to 25 MB per file. The preview playground (`playground/`) uses this mode for its
hosted conversion service; see `playground/README.md`.

## Repository map

| Directory | Responsibility |
| --- | --- |
| `src/cli.ts`, `src/cli/` | Command parsing, diagnostics and complete bundle writing |
| `src/api/` | Public conversion options and resource lifecycle |
| `src/input/` | HTML sources, root selection and node identity |
| `src/html/` | Shared element policies, atomic inline boundaries and input-control routing |
| `src/browser/` | Browser capture, computed styles, images and fonts |
| `src/model/` | Serializable layout, semantic and font contracts |
| `src/css/` | Pure CSS value parsers, grouped by property family |
| `src/analysis/` | Geometry, sizing, flow, text, controls and SVG inference |
| `src/compiler/` | Synchronous measured-layout → Swift compilation |
| `src/swift/` | Swift layout, paint, text, controls, tokens and runtime generation |
| `src/fonts/` | Font metadata, packaging and Python conversion |
| `tests/unit/`, `tests/helpers/` | Tests by source responsibility and shared test assertions |
| `tests/architecture/` | Dependency boundaries and runtime-cycle checks |
| `tests/integration/` | Public API, Chrome and native compilation tests |
| `tests/conformance/` | Visual conformance fixtures, feature inventory and the browser/iOS pilot runner |
| `tools/verify/`, `tools/quality.ts` | Swift typecheck, image comparison, native rendering and score validation |
| `playground/` | Local preview app and the separately deployable conversion service |

There is one conversion pipeline. Supply compiled CSS or a running page URL for framework
inputs. Small utilities stay with their domain (`css/syntax`, `analysis/geometry`,
`swift/format`) rather than a global miscellaneous utilities folder.

The HTML marker is `data-markswift-root`; generated helper names use `Markswift` and `.markswift`.
Older `data-h2s-*` markers and version-1 layouts are no longer accepted. When replacing an older
bundle, remove its `MarkswiftTokens.swift`, `MarkswiftShapes.swift` and `Font+Markswift.swift`.

## Quality and next steps

HTML tags share compiler strategies; they do not need a separate renderer for every tag.
For example, `article`, `section` and `div` use the same measured block/flex/grid rules.
The browser resolves the CSS cascade before conversion, so ordinary CSS, compiled Tailwind
and compiled CSS Modules use the same pipeline.

`HTML_ELEMENTS` classifies every standard element in the WHATWG index (checked 2026-09-16),
including the SVG and MathML entry points. `classifyElement(tag, attrs)` applies attribute-specific
exceptions such as links and input types. The analyzer and inline-text collector use this same
policy. Its support states describe implementation strategy, **not visual verification**:

| State | Meaning |
| --- | --- |
| `implemented` | A compiler path exists; individual CSS combinations and native behavior need verification |
| `approximated` | Captured content is rendered with an explicit limitation: an `approximated` diagnostic naming the element |
| `unsupported` | A measured placeholder or visible object fallback is emitted with an `unmapped` diagnostic |
| `nonvisual` | Metadata/resources are consumed by the browser rather than emitted as views |

Tables, ruby annotations and modal lifecycle currently have explicit approximation policies.
Canvas, embedded documents/resources, MathML and audio/video content need dedicated renderers.
Custom/unknown elements retain measured content and report missing semantics/behavior.
Prose links remain styled inline runs and report their dropped destination; block/atomic links
use native controls. Interactive attributed-text links remain a typography roadmap item.
The report covers captured nodes: hidden, non-rendering and flattened wrappers may not survive
capture. Element classification alone does not cover all CSS, accessibility or JavaScript.

```sh
bun run test:browser           # actual Chrome integration tests
bun run test:native            # Chrome, pinned Chromium + Xcode; compile and macOS-render output in both modes
bun run test:conformance       # conformance runner and manifest checks
bun run pilot --renderer mac --out tests/conformance/out/<dir>   # browser vs macOS SwiftUI render, both modes
bun run quality tests/conformance/baselines/visual-pilot-mac.json tests/conformance/out/<dir> tests/conformance/visual-policy-mac.json
bun run quality --summary tests/conformance/baselines/visual-all-mac.json
```

A fresh local iOS Simulator pilot on 2026-09-23 compared 64 captures: eight small HTML/CSS
fixtures at 320px and 390px, in light/dark and `app`/`fidelity` modes. **The currently approved
visual subset is the six-tile box-shadow fixture at those captured sizes.** Across its eight
captures, the lowest SSIM was 0.9539 in `app` mode and 0.9642 in `fidelity` mode. A separate
pixel assertion checked all six painted tiles, the green spread ring, the blue hard-offset
shadow, and their measured positions. This verifies that fixture's static paint output; it
does not establish responsive grid tracks or every possible shadow combination.

Flex wrapping, background layers, font families, inline text and image fitting showed material
browser/iOS differences in the same pilot and are outside the approved visual subset. A simple
grid fixture reached 0.9546 or better in `app` mode; equal-fill regular grids are reported exact.
The accepted subset will grow from repeatable native
comparisons and explicit geometry/text/paint checks, not from compiler coverage alone.

A separate local seven-case text pilot completed 56 native comparisons across two widths, two themes
and both modes. The isolated `<pre>` case preserved its spaces and three lines but reached only
0.8998 SSIM at worst because `ui-monospace` maps to a different native system face. `app` mode
uses native SwiftUI line breaking; `fidelity` keeps the captured line division. A local bundled
webfont reached 0.9523 at worst; its presence does not
guarantee identical glyph pixels.
Missing webfont bytes produce resource warnings and a fallback diagnostic. Generic platform-font
substitutions remain explicit approximations, including Arial/Helvetica rendered as SF Pro;
complex text needs more native visual work. Inline-block rows pinned to the captured line
division, gradient stops and shadows the parser cannot read, and CSS animations (captured at
their end state) are reported too.

The visual gate scores colour SSIM (minimum per channel at 1×), pixel mismatch and element-region
anchors. Baselines are tracked JSON manifests under `tests/conformance/baselines/`, written only by
`bun run quality --write-baseline <run-dir> <manifest.json>`. Every PR renders with macOS ImageRenderer;
releases render on an iOS Simulator. Feature floors are per mode (`<case>@<app|fidelity>`) in
`tests/conformance/visual-policy-*.json`. Captures use Playwright's pinned Chromium
(`./node_modules/.bin/playwright-core install --no-shell chromium`).

Portable tests assert that no standard element lacks a policy, that input routing stays consistent,
and that unsupported inline content cannot silently disappear. Chrome tests exercise nine semantic
container tags across block/flex/grid and compare their geometry and generated Swift. These checks
establish routing and layout consistency; they do not replace native rendering comparisons.

The first sizing pass normalizes `min/max-width` and `min/max-height` to border-box dimensions,
including padding, borders, percentage width limits and simple `calc()` expressions. Capture
retains cascaded width/height intent, so fixed stylesheet sizes and overridden inline sizes use
the same rules as compiled utility selectors. Finite caps preserve intrinsic boxes without
expanding their backgrounds; height floors and clipping preserve block text's top placement.
In app mode, bottom slack from min-height or flex alignment is placement, not padding; a
viewport-high root fills the device; text-bearing controls treat their measured height as a
floor; a page taller than the viewport scrolls, with fixed overlays outside the scroll view.
Chrome sizing tests cover 320, 390 and 768px in both themes.

Equal flex allocations can use native fill sizing. Unequal growth, bases or measured sizes,
and growth factors totaling less than one, retain captured dimensions with approximation
diagnostics. Percentage height constraints and unresolved intrinsic/complex limits also retain
captured bounds with diagnostics. These limits are measured pixels, not reconstructed responsive
CSS constraints. Intrinsic sizing and tables remain layout work.

Regular full-cell grids use native `Grid` when captured geometry matches the resolved tracks;
unequal tracks retain measured widths. Holes, spans, empty tracks, aligned intrinsic items,
overlap and RTL use captured child positions, preserving padding, borders and paint order.
Unequal tracks and captured positions report that columns do not resize at another width;
equal-fill regular grids reproduce `repeat(n, 1fr)` and are reported exact.

Row wrapping now uses a native layout that chooses rows again at the component's available
width. It supports fixed and intrinsically sized items with the default `flex-shrink`, pixel
gaps, and start/center/end alignment. It does not reevaluate source CSS or media queries. An
item already filling its line, any growth, margins, baseline alignment, `align-self`, CSS order,
reverse, column and RTL wrapping and unsupported cross-row distribution keep captured positions
with an explicit reflow limitation. Chrome regression tests cover these cases at three widths in both themes.

Development proceeds by feature family, with reusable fixtures and regression checks:

1. Layout: intrinsic sizing, flex/grid combinations, tables, wrapping, overlays, clipping and scroll.
2. Text: fonts, mixed inline content, line breaking, RTL, ruby and accessibility semantics.
3. Paint: layered gradients, borders, shadows, masks, filters and transforms.
4. Native behavior: control state, navigation callbacks, media, animation and responsive resizing.

Each family needs parser/inference tests, real Chrome capture, generated Swift compilation,
and representative native/browser visual comparisons at multiple widths and themes. Behavior
and accessibility need their own native assertions; a good screenshot score cannot prove them.
An unsupported feature must first report its loss, then gain a tested implementation. The release
scope will follow that verified matrix rather than claiming every HTML/CSS combination is covered.

Successful compilation is not proof of visual correctness. Complex layout, rich inline text,
font metrics, native resizing and accessibility still need improvement. Capture observes one
viewport and state; it does not infer all responsive or interactive behavior.

Research corpora, simulator screenshots, generated outputs and development notes are intentionally
excluded from this repository; the conformance fixtures and their runner are included. The
checked-in unit and integration tests run without simulator output. Native compilation tests
require macOS with Xcode; browser tests require Google Chrome. Node.js compatibility is not yet claimed.

Released under the [MIT License](LICENSE).
