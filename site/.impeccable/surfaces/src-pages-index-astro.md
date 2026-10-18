---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: []
---

Scope: the Markswift documentation site (`site/`, Astro static, GitHub Pages at koray.dev/markswift). Visitor mode: Read.
Audience: iOS/SwiftUI and web developers who want to understand how Markswift turns a rendered page into SwiftUI,
then run it. Job (user, 2026-10-18): explain how it works. The user rejected the previous build for its slogan hero,
white/black/red palette with condensed headings, one long table-heavy page, and too much text.
Constraints: every artifact shown is a verbatim slice of real Markswift input/output (`// …` marks cuts); every number
from a repo file or a compare.json; no invented claims.

## Direction contract

seed: none (unavailable)

THESIS: Markswift is a translator, so the docs are a parallel-text edition: each chapter is one facing-page spread,
the original on the verso and its translation on the recto, line-numbered, with an apparatus of losses at the foot.
Refuses the docs-site sidebar-and-prose default and the editorial-paper cluster.

OWN-WORLD: Cloth-green binding (#2f5d3a) owns the rail, running heads and line numbers; page paper off-white, ink
near-black, quiet grey-green secondary. Literata for title and reading text, Alegreya Sans SC for running heads,
sigla and contents, Fragment Mono for code. Gutter of shared line numbers; apparatus band ruled in green.

STORY: The reader follows one real component through the pipeline, spread by spread: page → capture → LayoutDoc →
IR → SwiftUI → runtime → the two renders and their score; then learns to run it and where it stops.

FIRST VIEWPORT: Green rail with the edition title and contents (chapter 1 marked); running head; chapter title and a
two-sentence opening; the HelloCard spread (real input on the verso, real Swift on the recto, shared line numbers);
apparatus; "turn the page" to chapter 2.

FORM: Parallel-text edition, rank 1 of 7 grounded candidates (chosen by the user over the roll's candidate 7).

SIGNATURE: A line number lights the same line on both pages and its apparatus entry; chapters turn like pages.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
