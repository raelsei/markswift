# Markswift architecture

```text
api/convert → input/source + browser/capture + fonts/package
                         ↓ LayoutDoc
compiler → analysis → semantic Screen → swift → generated files
              ↓                          ↓
             css                       fonts/metadata
                         model
```

`convert` owns browser, local server and temporary font-directory lifetimes. `finally`
blocks release them on success and failure. Its option/result contracts live in `api/types`;
HTML source and capture contracts live in `input/types`. Root selection and node identity
are shared policies, independent of the originating CSS framework.

`compileLayout` is synchronous and imports no browser, filesystem or font-packaging runtime.
Its package entry is `markswift/compiler`. Font metrics and bundled-family selection are
explicit per-conversion values. The compiler works on a measured document, not an HTML string.

## Source responsibilities

- `model`: serializable measured layout, semantic node and font types.
- `css`: pure parsers for colors, paint, backgrounds, shadows, transforms, effects, typography,
  radii and shared CSS syntax. The small index exposes an explicit public internal surface.
- `analysis`: inference orchestration delegates geometry, sizing, alignment, flow, node styles,
  text runs/layout, native controls and SVG interpretation. SVG traversal, gradients, geometry,
  text and transforms live in their own subdirectory.
- `swift`: the emitter assembles files. Node dispatch, native layout, frames, text, paint,
  borders, effects, images, controls and SVG each own their translation. A typed render callback
  connects recursive rendering without circular imports. Token extraction has its own modules.
- `fonts`: metadata is usable by the compiler; filesystem packaging, source decoding, Python
  conversion and generated registration/plist code are separate concerns.
- `browser`: capture owns browser orchestration; DOM snapshotting, font collection, image
  embedding, page settling and local serving are separate modules.

Utilities stay next to the domain they support. Shared model contracts and typed contexts
make dependencies explicit; there is no service container or catch-all utilities directory.
Runtime templates are separate from the code that decides which Swift expressions to emit.

## Inputs and tools

CSS source syntax is resolved before inference. A Tailwind utility and a compiled CSS Modules
selector producing the same computed style enter the same pipeline. The library takes HTML,
compiled CSS or a running page URL; it does not depend on framework-specific build adapters.

Current markers and generated names use Markswift. Existing `data-h2s-root`/`data-h2s` inputs
and version-1 capture metadata remain readable. These are compatibility spellings, not separate
conversion paths. Research tools and their data are intentionally kept outside the published
Git history. `tools/verify/typecheck.ts` and `tools/quality.ts` are portable verification helpers.

## Tests and boundaries

`tests/unit` mirrors source responsibilities; reusable assertions live in `tests/helpers`.
`tests/integration` exercises the public API in Chrome and compiles generated Swift.
`tests/architecture` rejects runtime import cycles, source dependencies on tools/tests,
colocated production tests, and filesystem/browser dependencies reachable from the compiler.
TypeScript also rejects unused locals and parameters.

Structural changes are checked against saved layouts and generated source. The modularization
replayed 602 Swift files without changes beyond the intentional Markswift names. This is a
preservation check, not evidence that all existing conversions are visually correct.

## Current limits

One output bundle represents one conversion; combining independently generated bundles still
requires shared helper/token merging. Capture observes one viewport/state. JavaScript behavior
is not translated. Empty diagnostics do not prove conversion fidelity. Complex layout, typography, resizing and accessibility remain areas for improvement.
