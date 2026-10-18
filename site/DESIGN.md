# Design

Scope: the documentation site in `site/`. Tokens live in `src/styles/site.css` (`:root`); this file records why.

## World

A railway timetable book: white paper, black ink, one signal red. Claims sit in ruled rows with their number and
their source; the pipeline is a route line with stations. Light only: the reader is at a desk in daylight with Xcode
beside the browser, comparing screenshots.

## Colour (restrained: neutrals plus one accent)

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#fdfdfc` | Ground |
| `--band` | `#f0f1ee` | Code blocks, inline code, table group rows |
| `--rule` | `#c7c9c4` | Hairlines between rows |
| `--ink` | `#121312` | Text, heavy rules (3px section heads, 1px table heads) |
| `--ink-2` | `#4a4c49` | Secondary text, labels (≥ 4.5:1 on paper and band) |
| `--red` | `#c4161c` | Route line, station stops, active-section stop, link underline, focus ring, selection |
| `--red-ink` | `#a8121a` | Swift keywords |

Red never fills an area larger than a station dot; state is a mark, not a fill.

## Type

- Archivo Variable (width axis): headings at `font-stretch` 72–78 %, weight 720–760, tracking −0.01 to −0.025em;
  labels and table heads at 80 %, weight 650–680; body at 100 %, 17px/1.6, 68ch measure. Tabular figures throughout.
- JetBrains Mono Variable only for code, paths and capture keys; ligatures off.

## Components

- Section: 3px ink rule; margin column (heading + source paths with red ticks) beside the reading column.
- Evidence plate: Chrome and SwiftUI captures at their CSS width or smaller, each under a ruled label; a ledger row
  (fixture, width, mode, state, SSIM) between ink rules; caption names the capture key and revision. The hero plate
  stacks the two captures with a range-input wipe.
- Route: ordered list on a 4px red line; ring stops, filled terminus; a dashed ink branch for verification.
- Tables: ink rule above and below the head, hairlines between rows, right-aligned tabular numbers.
- Focus: 2px red outline, 3px offset.
