# Markswift

Convert rendered HTML and CSS into SwiftUI source. **Experimental:** common UI patterns work,
but complex layout and typography still have visible limitations. This is a development repository, not an npm release.

## Start locally

Requirements: Bun (tested with 1.4.2) and installed Google Chrome. Custom webfonts additionally
require `python3` with `fontTools` and `brotli`. Xcode is needed to compile/test the generated
Swift, not to perform conversion. The generated code targets SwiftUI on iOS 18+.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
```

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
When fonts are returned, add `Fonts/` resources and merge `UIAppFonts.plist.fragment` into
the app's Info.plist, or call `MarkswiftFonts.register(in:)` with the resource bundle before rendering.
One conversion returns one standalone set of shared helper/token definitions. Combining
independent conversion results into the same target needs shared-file/token merging; do not
blindly copy duplicate helpers. Multi-component bundle generation remains a roadmap item.

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
  `body` (the legacy `data-h2s-root` marker is also accepted). Supply `root` to select a component. Fragment HTML keeps browser defaults; provide
  your reset CSS when needed.
- `css` accepts ordinary **compiled CSS**. Compiled Tailwind selectors and CSS Modules
  selectors work when their class names match the HTML. Bare utility classes do not provide
  styles by themselves. Raw JSX, CSS Modules imports and Tailwind build directives must run
  through the source project's build first; a dev-server URL is often the easiest input.
- `viewport` defaults to 390 × 844, `dpr` to 1, `theme` to `light`. Theme selects the browser's
  color-scheme media query. Class-based themes require the appropriate class in the markup
  or an optional `prepare(page)` callback. Use `waitFor` for client-mounted content.
- `mode: "app"` emits native layout; `"fidelity"` aims at the captured geometry for visual
  comparison. One viewport is one observed state, not an inferred set of responsive rules.
- The result contains `code`, `files`, font `assets`, node `diagnostics`, resource/font
  `warnings`, and measured `layout`. Loaded images are embedded in the captured layout so
  generated code does not depend on a temporary local server. Unavailable images are reported.
- `compileLayout` accepts prepared `bundledFamilies` and `fontMetrics` for custom fonts.
  Without them it uses native system fonts and reports substitutions. It does not package assets.

HTML scripts execute in Chrome during capture. Use trusted local inputs; this API is not an
isolation boundary for hosting arbitrary uploads. Source JavaScript and navigation/business
logic are not translated into Swift application logic.

## Repository map

| Directory | Responsibility |
| --- | --- |
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
| `tools/verify/typecheck.ts`, `tools/quality.ts` | Swift compiler checks and comparison-score validation |

There is one conversion pipeline. Supply compiled CSS or a running page URL for framework
inputs. Small utilities stay with their domain (`css/syntax`, `analysis/geometry`,
`swift/format`) rather than a global miscellaneous utilities folder.

The canonical HTML marker is `data-markswift-root`; `data-h2s-root` remains accepted for
existing inputs. Generated helper names now use `Markswift` and `.markswift`. When replacing
an older generated bundle, remove its old `DesignSupport.swift`, `DesignTokens.swift`,
`H2SShapes.swift` and `Font+H2S.swift` before adding the new complete bundle.

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
| `approximated` | Captured content is rendered with an explicit limitation in `diagnostics` |
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
bun run test:native            # Chrome + Xcode; compile public API output in both modes
bun run quality baseline.json current.json
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
grid fixture reached 0.9546 or better in `app` mode, but its diagnostics still say responsive
track definitions were not reconstructed. The accepted subset will grow from repeatable native
comparisons and explicit geometry/text/paint checks, not from compiler coverage alone.

For a reviewed visual baseline, `bun run quality <baseline-directory> <current-directory> <policy.json>`
can additionally require complete browser/iOS/diff images, matching dimensions and file hashes,
valid mismatch and source/runtime metadata, an expected source revision, a per-feature absolute
SSIM floor and a maximum regression from the baseline. A strict policy uses `requireEvidence`,
`expectedSourceRevision`, `features.<feature>.minSsim`, and `maxDrop`. Keep the reviewed baseline
separate from new output; the quality command never updates it.

Portable tests assert that no standard element lacks a policy, that input routing stays consistent,
and that unsupported inline content cannot silently disappear. Chrome tests exercise nine semantic
container tags across block/flex/grid and compare their geometry and generated Swift. These checks
establish routing and layout consistency; they do not replace native rendering comparisons.

The first sizing pass normalizes `min/max-width` and `min/max-height` to border-box dimensions,
including padding, borders, percentage width limits and simple `calc()` expressions. Capture
retains cascaded width/height intent, so fixed stylesheet sizes and overridden inline sizes use
the same rules as compiled utility selectors. Finite caps preserve intrinsic boxes without
expanding their backgrounds; height floors and clipping preserve block text's top placement.
Chrome sizing tests cover 320, 390 and 768px in both themes.

Equal flex allocations can use native fill sizing. Unequal growth, bases or measured sizes,
and growth factors totaling less than one, retain captured dimensions with approximation
diagnostics. Percentage height constraints and unresolved intrinsic/complex limits also retain
captured bounds with diagnostics. These limits are measured pixels, not reconstructed responsive
CSS constraints. Intrinsic sizing and tables remain layout work.

Regular full-cell grids use native `Grid` when captured geometry matches the resolved tracks;
unequal tracks retain measured widths. Holes, spans, empty tracks, aligned intrinsic items,
overlap and RTL use captured child positions, preserving padding, borders and paint order.
These grid paths report that responsive track definitions are not reconstructed.

Row wrapping now uses a native layout that chooses rows again at the component's available
width. It supports captured fixed-size items with growth and shrink disabled, pixel gaps,
and start/center/end alignment. It does not reevaluate source CSS or media queries. Reverse
and column wrapping, intrinsic sizes, grow/shrink allocation, margins, baseline alignment,
CSS order and unsupported cross-row distribution retain captured positions with an explicit
reflow limitation. Chrome regression tests cover these cases at three widths in both themes.

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
viewport and state; it does not infer all responsive or interactive behavior. A multi-component
bundle linker remains planned work; the separate preview playground is kept locally.

Research corpora, local simulator fixtures, generated screenshots and development state notes
are intentionally excluded from this repository. The checked-in unit and integration tests
run without those files. Native compilation tests require macOS with Xcode; browser tests
require Google Chrome. Node.js compatibility is not yet claimed.

No release license has been selected yet.
