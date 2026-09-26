# Markswift

Markswift captures HTML and computed CSS in Chrome, then generates SwiftUI source and the resources it needs. It accepts a full document, an HTML fragment, a local file or a running page URL. Regular CSS, compiled Tailwind and compiled CSS Modules follow the same capture pipeline. Raw Tailwind directives, JSX and JavaScript behavior are not translated.

**Status: experimental alpha.** An HTML tag having a route through the compiler does not mean its appearance, resizing or interaction matches the browser. The repository is private and no public release license has been selected.

## Try the CLI

Requires Google Chrome. The source checkout uses Bun 1.4.2+ for installation and build; the built CLI and library also run on Node.js 20+ (verified with Node 20 and 26). Xcode is required to compile or test the generated Swift, not to run the converter. From this checkout:

```sh
bun install --frozen-lockfile
printf '%s\n' '<main data-markswift-root style="width:240px;height:80px;font:18px system-ui">Hello Markswift</main>' \
  | bun src/cli.ts convert - --name HelloCard --out ./generated-hello
```

`generated-hello/` contains the view and shared Swift files. Add **all** generated `.swift` files to one iOS 18+ target. The output directory must not exist before conversion; choose a new name for another run.

For private GitHub testing from another project with repository access, install the current alpha branch and run its built CLI:

```sh
bun add 'git+ssh://git@github.com/raelsei/markswift.git#codex/core-alpha'
./node_modules/.bin/markswift --help
```

The package is not published to npm.

For an existing HTML file, use `bun src/cli.ts convert ./page.html --out ./generated-page`. Add `--css ./compiled.css` only when you have a separate compiled stylesheet. Local relative assets are resolved beside the HTML file. A stylesheet already linked by that file is loaded by Chrome. For a running application, use `bun src/cli.ts convert --url http://localhost:5173/ --root '#component' --out ./generated-component`. Piped HTML (`-`) should use inline CSS and self-contained/data-URL assets. Run `bun src/cli.ts --help` for viewport, theme, mode and other options.

For one known CSS width breakpoint, add `--compact-width 320 --breakpoint 350 --width 390` to the same `convert` command. The CLI captures both widths from the same source and writes one Swift view that selects the compact branch through 350 points. `--height` applies to both captures. It prints mapping counts separately for compact and regular; those counts are not visual accuracy. Use a new output directory for each run.

The CLI exits with 0 on conversion, 2 on invalid options and 1 on input/conversion errors. Swift view names must start with an uppercase ASCII letter; framework type names and the `Markswift` prefix are reserved. Warnings and specific approximation notes go to stderr. It also prints a node-mapping summary; **that percentage is not visual accuracy**.

## Use the library

The installed package exposes the same API to Bun and Node.js. It measures and converts a document, fragment, file or URL:

```ts
import { convert } from "markswift";

const result = await convert(
  { html: '<main data-markswift-root class="card">Hello</main>' },
  { name: "CardView", css: ".card { width: 240px; background: gold; }" },
);

console.log(result.code, result.mapping, result.diagnostics, result.warnings);
// result.files: all Swift sources; result.assets: binary resources such as fonts
```

`convert({ file: "./page.html" })` and `convert({ url: "http://localhost:5173/" }, { root: "#component" })` use the same pipeline. `css` must already be compiled. Default capture size is 390 × 844; `viewport`, `theme`, `mode`, `waitFor` and `prepare(page)` can select a state. The default root is `[data-markswift-root]`, otherwise `body`; the old `data-h2s-root` marker remains accepted.

For a page with one known width breakpoint, capture each side and generate one SwiftUI view:

```ts
import { convertResponsive } from "markswift";

const result = await convertResponsive(
  { file: "./page.html" },
  {
    name: "PageView",
    breakpoint: 350,
    compact: { viewport: { width: 320, height: 844 } },
    regular: { viewport: { width: 390, height: 844 } },
  },
);

// Add every result.files entry and result.assets to one iOS target.
// PageView chooses the compact branch at offered widths up to 350 points.
console.log(result.code, result.views, result.warnings);
```

Both captures use the same source, stylesheet, theme and `prepare(page)` hook; the hook runs once per capture. The compact width must be at or below the breakpoint, and the regular width above it. `result.layouts` retains both measured documents, `result.views` reports each generated branch, and `result.branchWarnings` keeps capture warnings separately. The wrapper selects from two captured layouts using its offered SwiftUI width. It does not interpolate CSS at intermediate widths, reconstruct every `@media` condition, or react to orientation and container queries. This API is available in the library, CLI and playground.

`compileLayout(layout)` is a synchronous browser-free compiler for an already measured `LayoutDoc`; import it from `markswift/compiler`. For several captured components in one Swift target, use `compileLayouts([{ layout: first, name: "FirstView" }, { layout: second, name: "SecondView" }])`. It returns one `files` bundle with shared runtime, tokens and shapes, plus per-view diagnostics in `views`; duplicate view names or conflicting resource paths fail explicitly. Give light and dark captures of the same component one `componentId` and distinct view names to pair their colors. The package includes built JavaScript, type declarations and a `markswift` CLI for Node.js, plus Bun source exports. Both runtimes still need Chrome for HTML/CSS capture. Building or repacking from source requires Bun.

TypeScript consumers using the Playwright `prepare(page)` hook need Node type declarations and the `ESNext.Disposable` library in their TypeScript configuration.

Add every entry in `result.files` to the same Swift target. Add `result.assets` to its resources. If fonts are included, merge `UIAppFonts.plist.fragment` into Info.plist or call `MarkswiftFonts.register(in:)` before rendering. For multiple HTML inputs without custom fonts, pass their captured `LayoutDoc` values to `compileLayouts`; merging separate `convert` results directly can duplicate shared Swift definitions. Custom-font batches must also supply `bundledFamilies`, `fontMetrics`, support files and assets explicitly, or the regenerated views can fall back to system fonts.

HTML scripts run during normal capture. Use trusted local pages. For a hosted paste-only converter, `convert({ html }, { untrustedInput: true })` blocks page scripts and outbound resource requests, but the browser process should still run in an isolated environment. An external image URL that cannot be embedded may remain as a runtime `AsyncImage` request in the generated Swift; the capture setting does not impose an offline-only policy on the resulting app.

## What the numbers mean

`result.mapping` counts **emitted semantic nodes** as `total`, `mapped`, `approximated` and `unmapped`. Its denominator is not every DOM element or CSS declaration: invisible and flattened nodes may not be emitted. `result.diagnostics` explains known approximations and missing mappings by node; `result.warnings` reports capture, resource and font problems. A high mapped percentage does not prove that the Swift view looks right. Read the diagnostics **and** warnings with the count.

Chrome is needed to resolve the CSS cascade, fonts and geometry before conversion. Visual fidelity requires an additional comparison between a browser image and the rendered iOS component, at specified sizes and themes. Compile success, tag classification and a single screenshot score are different checks.

## Playground

The playground lives in `apps/playground`. It is a separate application that calls the public `markswift` library through a small Bun service. Its HTML preview shows the **browser source**, not rendered SwiftUI. The output panel shows every generated Swift file, a downloadable bundle and the mapping report. Choose **Two widths** to capture compact and regular states with an explicit breakpoint; each branch has its own mapping report, diagnostics and capture warnings. The HTML preview can switch between those widths. Pasted scripts and external requests are blocked in the preview and conversion service.

The source preview applies the selected theme to CSS color-scheme media queries and literal light/dark scheme lists. Variable-derived `color-scheme` choices can retain the host browser's native control palette; conversion uses Chrome's actual requested theme independently of this preview.

Run it locally after installing the repository's root dependencies:

```sh
bun install --frozen-lockfile
cd apps/playground
bun run dev
```

Open `http://127.0.0.1:4325/`. This local server serves both the static frontend and `/api/convert`; installed Google Chrome is required for conversion. `bun run typecheck`, `bun run test` and `MARKSWIFT_BROWSER_TESTS=1 bun run test` check the app and service. The service accepts pasted HTML and compiled CSS only, with bounded inputs, two concurrent conversions and a 60-second conversion deadline.

The default request to `/api/convert` captures one width. For responsive conversion, send `compactWidth` and `breakpoint` together with an explicit regular `viewport`; `compactWidth ≤ breakpoint < viewport.width` is required. Both branches share the requested height, CSS, theme and mode, and run within the same worker deadline. The response contains `breakpoint` and a `branches` array with each branch's dimensions, mapping, diagnostics and warnings, alongside shared files, assets and aggregate warnings.

The frontend can be deployed as **static files**, including to GitHub Pages. Build it with `PLAYGROUND_API_ORIGIN=https://your-api-origin.example bun run build` from `apps/playground`, then publish `apps/playground/dist/`. [GitHub Pages from a private repository requires an eligible GitHub plan](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), and its published site is public even when the source repository is private. Start the service separately on a Bun host with Chrome installed:

```sh
PLAYGROUND_ORIGIN=https://your-pages-origin.example PORT=8787 bun run start:api
```

Deploy the API from the whole repository checkout after the root `bun install --frozen-lockfile`; it imports the package's public source entry. `PLAYGROUND_ORIGIN` must exactly match the deployed frontend origin (scheme, host and optional port, without a path). The service listens on `0.0.0.0` and accepts the host's `PORT` variable; `PLAYGROUND_PORT` overrides it. Use a Linux or macOS service host and set a client rate limit at its public edge before opening the API to everyone. The frontend alone remains usable for HTML reference preview, but cannot convert without the service. Actual SwiftUI rendering requires an iOS target or simulator, so this browser app does not claim to preview the native result.

The checked-in HTML policy lists 115 tags from a September 2026 element inventory. Container and inline-text families share generic layout/text paths; elements do not each need a custom renderer. Complex tables, ruby, modal lifecycle, relative links and some controls have explicit approximations. Canvas, embedded documents, MathML, SVG `foreignObject` and audio/video content need dedicated renderers and currently use diagnosed fallbacks. A `<video poster>` retains its static poster image, while playback and controls remain unsupported; audio and videos without posters keep their diagnosed placeholders. Embedded PNG, JPEG, GIF and WebP backgrounds retain their intrinsic size and position. Embedded `<img>` sources with known intrinsic size support `object-position` keywords and percentages with `cover` or `contain`; JPEG EXIF rotation is included in their displayed size. Length offsets and images with unknown dimensions remain diagnosed approximations. Source JavaScript behavior, CSS animation timelines, navigation and full responsive CSS rules are not reconstructed from captured states. Active animation and transition styles receive node diagnostics; readable `@keyframes` and `@media` rules receive capture warnings even when they are dormant at the chosen viewport. Simple in-flow block percentage widths and equal `calc()`-sized flex tracks that fill their row resize in app mode; other complex percentage widths keep their captured pixels and a resize limitation note. Unknown custom elements retain measured content with a limitation note. Inline and block links with supported absolute http(s), mailto or tel destinations emit native links; relative, fragment and unsupported schemes need app navigation and stay diagnosed. A guarded subset of full-width, equal-column fixed tables resizes with its container; spans, other column rules and table accessibility remain approximated.

Form capture includes effective `fieldset disabled` state, with the first-legend exception. Readonly text fields and text areas retain their value or placeholder as noneditable text; browser focus and selection behavior remain approximated. Date, time and datetime-local pickers start from the captured Gregorian/local components and expose matching native selection components. Month/week selection retains the exact value as static text. Empty date selections, seconds, validation constraints and locale appearance receive explicit diagnostics.

Named radios share native selection by their exact name and Chrome's actual form owner, including external forms, duplicate form IDs, boxless forms and parser-repaired markup. Selecting a radio clears its rendered group peers; pressing the selected radio cannot clear it. Unnamed radios remain independent, disabled choices cannot activate, and fidelity mode retains the captured checks. Only captured controls participate in the native view; outside-root controls, browser label activation, keyboard group navigation, validation and form submission require app integration. Captures lacking proven ownership keep independent selection with a diagnostic.

Single selects keep stable choice ordinals, original submitted values, duplicate and empty labels, nested option text, disabled options/optgroups, and an explicitly unselected state. Native menu buttons use ordinals rather than labels or values for identity. Options hidden by `hidden` or `display:none` retain their captured selection but are omitted from menu actions. An empty `label` attribute falls back to the option's text for display; an empty submitted value stays empty. HTML option text follows the [HTML Standard's ASCII whitespace rules](https://html.spec.whatwg.org/multipage/form-elements.html#the-option-element). Multiple selects and listboxes retain their selected labels as static text with a diagnostic; row layout, scrolling, editing, optgroup headings and form submission still need app integration.

## Alpha scope and release gates

The alpha implementation covers these seven parts:

1. **Core and CLI:** file, stdin and URL input; explicit options and exit codes; a complete non-overwriting Swift bundle; diagnostics and node-mapping counts.
2. **Element policy:** 115 classified tags, shared container/text routes and conformance tests by element family. Unsupported content retains measured content or a diagnosed placeholder.
3. **Module boundaries:** capture, CSS parsing, semantic inference, Swift generation and output writing are separate. Architecture tests prohibit runtime cycles and browser/filesystem dependencies in the standalone compiler.
4. **Bun and Node:** built JavaScript, declarations and CLI are committed for Git installation. Installed-package tests exercise capture and conversion in both runtimes.
5. **Responsive states:** the library, CLI and playground capture both sides of one explicit width breakpoint and emit one shared Swift bundle.
6. **Visual regression gates:** eight fixture families compare Chrome with generated Swift on an iOS Simulator at two widths, two themes and in both output modes.
7. **Playground:** a compact frontend, branch-specific reports, downloadable output and a bounded isolated conversion worker. Static frontend deployment uses a separately hosted Bun/Chrome API.

These are bounded alpha capabilities. Further work includes general flex/grid allocation, irregular tables and spans, editable listboxes/multiple selects, month/week editing, browser validation, additional breakpoints, container/orientation queries, complete CSS effects and animation timelines, and JavaScript application behavior. Embedded documents, canvas, MathML and media playback still need dedicated renderers. Public hosting also needs deployment checks, an edge rate limit and a selected public license. Native SwiftUI preview is a separate future capability.

Run the portable checks with `bun run typecheck` and `bun run test`. `bun run test:browser` exercises Chrome and installed Bun/Node consumers; `bun run test:native` compiles generated Swift with Xcode on macOS. The normal test command skips opt-in browser/native tests.

The opt-in `bun run test:visual` performs **64 Chrome–iOS comparisons**: eight fixtures at 390 and 320 points, in light/dark themes and app/fidelity modes. In app mode, most fixtures resize from one 390-point capture; the full-page CSS breakpoint fixture uses two captures in one responsive view. Fidelity uses each capture's own geometry. Form app snapshots mount a real UIKit-hosted SwiftUI view so live fields are present; other snapshots use SwiftUI's ImageRenderer.

| Fixture family | Checked behavior |
| --- | --- |
| Rich text | Inline fonts, decoration, line breaks and heading glyphs |
| Full page | Nested sections and compact/regular CSS breakpoint branches |
| Flex cards | Equal wrapping tracks, live widths and text-driven row heights |
| Grid | Equal grid tracks and colored tile positions |
| Table | Full-width fixed equal columns, cell geometry and caption text |
| Form | Captured text/password values, selected option, readonly text and native control paint |
| Effects and SVG | Linear/radial gradients, border/inset shadow, clipped pseudo decoration and native SVG paint |
| Image placement | Horizontal/vertical crops and EXIF-rotated JPEG positioning |

Each exact-size comparison must have mean RGB channel error at most **8 out of 255**. Heading and form-value regions must have error at most **32** and retain at least **70%** of contrasting foreground pixels. Layout and effect regions use a tighter RGB error limit of **16**; sampled pixels verify theme, track colors and image crops. Form-value checks exclude borders and measure against the field background so borders cannot substitute for missing text. These are regression gates for the named fixtures, not conversion percentages or evidence that arbitrary pages are visually identical.

The visual command requires Chrome and Xcode with an iOS 18+ iPhone Simulator. It saves PNGs under ignored `out/visual-smoke/`. To rerun selected families during development, use `MARKSWIFT_VISUAL_FIXTURES=flex,form bun run test:visual`. Release validation includes all families, portable/browser/native checks and the playground's tests, typecheck and static build.

| Path | Responsibility |
| --- | --- |
| `src/api`, `src/input`, `src/browser` | Source resolution and measured browser capture |
| `src/html`, `src/css`, `src/model` | Element policy, CSS values and intermediate contracts |
| `src/analysis`, `src/compiler`, `src/swift` | Semantic inference and Swift generation |
| `src/fonts` | Font capture and packaging |
| `src/cli.ts`, `src/cli` | Command parsing and bundle writing |
| `apps/playground/web`, `apps/playground/service` | Static playground frontend and isolated conversion service |
| `tests/unit`, `tests/architecture`, `tests/integration` | Local behavior, dependency boundaries and real conversion checks |

Only source, built package files, tests, the new playground app, tools needed for portable checks and this README are tracked. Local research, visual baselines, the older playground and generated output stay outside the distributed package.
