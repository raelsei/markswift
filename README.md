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

The CLI exits with 0 on conversion, 2 on invalid options and 1 on input/conversion errors. Warnings and specific approximation notes go to stderr. It also prints a node-mapping summary; **that percentage is not visual accuracy**.

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

`compileLayout(layout)` is a synchronous browser-free compiler for an already measured `LayoutDoc`; import it from `markswift/compiler`. For several captured components in one Swift target, use `compileLayouts([{ layout: first, name: "FirstView" }, { layout: second, name: "SecondView" }])`. It returns one `files` bundle with shared runtime, tokens and shapes, plus per-view diagnostics in `views`; duplicate view names or conflicting resource paths fail explicitly. Give light and dark captures of the same component one `componentId` and distinct view names to pair their colors. The package includes built JavaScript, type declarations and a `markswift` CLI for Node.js, plus Bun source exports. Both runtimes still need Chrome for HTML/CSS capture. Building or repacking from source requires Bun.

TypeScript consumers using the Playwright `prepare(page)` hook need Node type declarations and the `ESNext.Disposable` library in their TypeScript configuration.

Add every entry in `result.files` to the same Swift target. Add `result.assets` to its resources. If fonts are included, merge `UIAppFonts.plist.fragment` into Info.plist or call `MarkswiftFonts.register(in:)` before rendering. For multiple HTML inputs without custom fonts, pass their captured `LayoutDoc` values to `compileLayouts`; merging separate `convert` results directly can duplicate shared Swift definitions. Custom-font batches must also supply `bundledFamilies`, `fontMetrics`, support files and assets explicitly, or the regenerated views can fall back to system fonts.

HTML scripts run during normal capture. Use trusted local pages. For a hosted paste-only converter, `convert({ html }, { untrustedInput: true })` blocks page scripts and outbound resource requests, but the browser process should still run in an isolated environment. An external image URL that cannot be embedded may remain as a runtime `AsyncImage` request in the generated Swift; the capture setting does not impose an offline-only policy on the resulting app.

## What the numbers mean

`result.mapping` counts **emitted semantic nodes** as `total`, `mapped`, `approximated` and `unmapped`. Its denominator is not every DOM element or CSS declaration: invisible and flattened nodes may not be emitted. `result.diagnostics` explains known approximations and missing mappings by node; `result.warnings` reports capture, resource and font problems. A high mapped percentage does not prove that the Swift view looks right. Read the diagnostics **and** warnings with the count.

Chrome is needed to resolve the CSS cascade, fonts and geometry before conversion. Visual fidelity requires an additional comparison between a browser image and the rendered iOS component, at specified sizes and themes. Compile success, tag classification and a single screenshot score are different checks.

## Playground

The playground lives in `apps/playground`. It is a separate application that calls the public `markswift` library through a small Bun service. Its HTML preview shows the **browser source**, not rendered SwiftUI. The output panel shows every generated Swift file, a downloadable bundle and the mapping report. Pasted scripts and external requests are blocked in the preview and conversion service.

Run it locally after installing the repository's root dependencies:

```sh
bun install --frozen-lockfile
cd apps/playground
bun run dev
```

Open `http://127.0.0.1:4325/`. This local server serves both the static frontend and `/api/convert`; installed Google Chrome is required for conversion. `bun run typecheck`, `bun run test` and `MARKSWIFT_BROWSER_TESTS=1 bun run test` check the app and service. The service accepts pasted HTML and compiled CSS only, with bounded inputs, two concurrent conversions and a 60-second conversion deadline.

The frontend can be deployed as **static files**, including to GitHub Pages. Build it with `PLAYGROUND_API_ORIGIN=https://your-api-origin.example bun run build` from `apps/playground`, then publish `apps/playground/dist/`. [GitHub Pages from a private repository requires an eligible GitHub plan](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), and its published site is public even when the source repository is private. Start the service separately on a Bun host with Chrome installed:

```sh
PLAYGROUND_ORIGIN=https://your-pages-origin.example PORT=8787 bun run start:api
```

Deploy the API from the whole repository checkout after the root `bun install --frozen-lockfile`; it imports the package's public source entry. `PLAYGROUND_ORIGIN` must exactly match the deployed frontend origin (scheme, host and optional port, without a path). The service listens on `0.0.0.0` and accepts the host's `PORT` variable; `PLAYGROUND_PORT` overrides it. Use a Linux or macOS service host and set a client rate limit at its public edge before opening the API to everyone. The frontend alone remains usable for HTML reference preview, but cannot convert without the service. Actual SwiftUI rendering requires an iOS target or simulator, so this browser app does not claim to preview the native result.

The checked-in HTML policy lists 115 tags from a September 2026 element inventory. Container and inline-text families share generic layout/text paths; elements do not each need a custom renderer. Tables, ruby, modal lifecycle, links and some controls have explicit approximations. Canvas, embedded documents, MathML, SVG `foreignObject` and audio/video content need dedicated renderers and currently use diagnosed fallbacks. A `<video poster>` retains its static poster image, while playback and controls remain unsupported; audio and videos without posters keep their diagnosed placeholders. Embedded PNG, JPEG, GIF and WebP backgrounds retain their intrinsic size and position. Source JavaScript behavior, CSS animation timelines, navigation and full responsive CSS rules are not reconstructed from one captured state. Active animation and transition styles receive node diagnostics; readable `@keyframes` and `@media` rules receive capture warnings even when they are dormant at the chosen viewport. Simple in-flow block percentage widths and equal `calc()`-sized flex tracks that fill their row resize in app mode; other complex percentage widths keep their captured pixels and a resize limitation note. Unknown custom elements retain measured content with a limitation note.

## Roadmap and release gates

1. **Core and CLI:** reproducible clean install; file, stdin and URL input; complete non-overwriting Swift bundle; diagnostics and node-mapping counts.
2. **No silent element loss:** conformance fixtures by element family and CSS family; captured state for controls, inline break opportunities, placeholders and unknown elements. Every unsupported visible case must leave content or a diagnosed fallback.
3. **Smaller modules:** split long text inference, semantic dispatch and browser snapshot responsibilities while keeping generated output stable on existing fixtures.
4. **Portable package:** ship built JavaScript, types and CLI; exercise the full capture API in installed Bun and Node consumers. Keep generated files in Git so a private Git dependency works without a build hook.
5. **Responsive states:** capture both sides of an explicitly supplied viewport breakpoint, compile one shared Swift bundle and select the matching view at native runtime. Start with one width breakpoint; orientation, container queries and other state axes need separate coverage.
6. **Visual acceptance:** compare representative components and full pages in Chrome and an iOS Simulator at multiple widths, themes and both output modes. Publish explicit per-family quality gates and known limits before a public alpha.
7. **Playground:** the separate static frontend and bounded conversion service are in place. Public hosting needs Chrome on the service, edge rate limiting and deployment checks; native SwiftUI preview is a later capability.

Run the portable checks with `bun run typecheck` and `bun run test`. `bun run test:browser` exercises Chrome; `bun run test:native` compiles generated Swift with Xcode on macOS. The normal test command skips the browser/native suites. A release must pass all three classes and an installed-package smoke test; visual acceptance is tracked separately.

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
