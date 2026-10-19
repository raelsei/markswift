# Product

<!-- impeccable:product-schema 1 -->

Scope: the Markswift documentation site in `site/` only. Inferred from the brief and the repository
(README.md, CHANGELOG.md); no interview round took place. Every fact below is sourced from those files.

## Platform

web

## Stack

Astro, static output, deployed to GitHub Pages at https://markswift.koray.dev/ (root base `/`).

## Users

iOS and SwiftUI developers, and web developers who own an HTML/CSS design (shadcn/ui, Tailwind), evaluating whether
Markswift can turn that design into SwiftUI they can ship, and then learning how to run it.

## Product Purpose

Markswift captures rendered HTML/CSS in Chrome and writes reusable SwiftUI components (iOS 18+, Swift 6) that look
like the browser's rendering. The site explains what it is, how the pipeline works, how to use it, how its output is
verified, and what it does not translate.

## Positioning

Output is measured, not asserted: every conformance fixture is rendered by Chrome and by SwiftUI (macOS
ImageRenderer, iOS simulator) and scored with colour SSIM against tracked baselines whose floors only ratchet up.
Losses are reported per node as mapped, approximated or unmapped.

## Capabilities and Constraints

- CLI `markswift convert`, `markswift build`; API `convert`, `convertHtml`, `compileLayout`, `buildLibrary`.
- Two modes: `app` (the product, reflowing, Dynamic Type) and `fidelity` (pixel-pinned, for verification).
- LayoutDoc 5 is a frozen, versioned capture schema; a cache, not an interchange format.
- Requirements: Node ≥ 20 or Bun, Google Chrome, optional python3 fontTools/brotli, Xcode to compile output.

## Evidence on Hand

- `tests/conformance/baselines/visual-all-ios.json` and the README quality block (per-family SSIM table).
- Chrome vs SwiftUI captures from the 2.0 iOS run (`browser.png`, `native.png`, `compare.json`).
- No testimonials, users, download counts or benchmarks exist; none may be invented.

## Product Principles

- Measure, then claim; cite the file the number came from.
- Report every loss instead of hiding it.
- The generated code is tool-owned and regenerable; customisation lives outside it.
