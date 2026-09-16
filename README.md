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

```sh
bun run test:browser           # actual Chrome integration tests
bun run test:native            # Chrome + Xcode; compile public API output in both modes
bun run quality baseline.json current.json
```

Successful compilation is not proof of visual correctness. Complex layout, rich inline text,
font metrics, native resizing and accessibility still need improvement. Capture observes one
viewport and state; it does not infer all responsive or interactive behavior. A multi-component
bundle linker and a separate HTML/Swift example remain planned work.

Research corpora, local simulator fixtures, generated screenshots and development state notes
are intentionally excluded from this repository. The checked-in unit and integration tests
run without those files. Native compilation tests require macOS with Xcode; browser tests
require Google Chrome. Node.js compatibility is not yet claimed.

No release license has been selected yet.
