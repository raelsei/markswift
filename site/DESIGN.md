---
name: Markswift
description: How Markswift works, set as a parallel-text edition — original on the verso, SwiftUI on the recto, losses in the apparatus.
colors:
  cloth: "#2f5d3a"
  cloth-d: "#244a2e"
  paper: "#eef0eb"
  leaf: "#f8f9f6"
  ink: "#1b1d1b"
  ink-2: "#4c5649"
  rule: "#d2d8ce"
  wash: "#d9e5d3"
  rail-ink: "#eef2ea"
  rail-2: "#cfe2c8"
  rail-line: "#6f9275"
  selection: "#c5d9bd"
typography:
  display:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "clamp(1.9rem, 1.4rem + 1.2vw, 2.3rem)"
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: "-0.012em"
  wordmark:
    fontFamily: "Alegreya Sans SC, Gill Sans, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
  body:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
  body-small:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.55
  gloss:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Alegreya Sans SC, Gill Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    letterSpacing: "0.04em"
  label-strong:
    fontFamily: "Alegreya Sans SC, Gill Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.08em"
  code:
    fontFamily: "Fragment Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: "1.34rem"
  line-number:
    fontFamily: "Fragment Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: "1.34rem"
    fontFeature: "\"tnum\""
rounded:
  none: "0"
  focus: "2px"
spacing:
  line: "1.34rem"
  pad: "1.4rem"
  rail-inset: "1.6rem"
  gutter: "3.25rem"
  page-margin: "clamp(1.25rem, 4vw, 4rem)"
components:
  rail:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.rail-ink}"
    width: "15.5rem"
    padding: "1.9rem 0 1.6rem"
  toc-entry:
    textColor: "{colors.rail-ink}"
    typography: "{typography.label}"
    padding: "0.3rem 1.6rem"
  toc-entry-current:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  rail-command:
    backgroundColor: "{colors.cloth-d}"
    textColor: "{colors.paper}"
    padding: "0.55rem 0.7rem"
  running-head:
    textColor: "{colors.cloth}"
    typography: "{typography.label}"
    padding: "0.95rem 0 0.7rem"
  page-head:
    textColor: "{colors.cloth}"
    typography: "{typography.label}"
    padding: "0.6rem 1.4rem 0.5rem"
  spread-page:
    backgroundColor: "{colors.leaf}"
  spread-gutter:
    backgroundColor: "{colors.paper}"
    width: "{spacing.gutter}"
  spread-line:
    textColor: "{colors.ink}"
    typography: "{typography.code}"
  spread-line-lit:
    backgroundColor: "{colors.wash}"
  line-number:
    textColor: "{colors.cloth}"
    typography: "{typography.line-number}"
  line-number-lit:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.leaf}"
  apparatus-entry:
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    padding: "0.22rem 0.45rem 0.3rem"
  turn-link:
    textColor: "{colors.ink}"
    padding: "1rem 0 1.4rem"
  command-block:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    padding: "0.5rem 0.75rem"
---

# Design System: Markswift

## Overview

**Creative North Star: "The Parallel-Text Edition"**

Markswift is a translator, so its documentation is set the way scholarly editions set a text beside its translation. Each chapter is one facing-page spread: the original (HTML, a capture, a LayoutDoc) on the narrower verso, what Markswift wrote from it on the recto, the two pages sharing one gutter of line numbers, and an apparatus at the foot that records each correspondence and every loss. A cloth-green binding runs the full height of the book on the left and carries the title, the edition statement and the contents.

The register is quiet and exact. Cool off-white paper, near-black ink, one green, hairline rules; three faces with fixed duties (a serif to read, small capitals to label, a mono for the texts themselves). Density is that of a reference book, not a landing page: short openings, then the evidence, set verbatim. Nothing floats, glows or rounds; depth comes from paper tones and rules alone.

The user rejected the previous world for its white/black/red palette, condensed headings, slogan hero and one long table-heavy page; none of those belong here.

**Key Characteristics:**
- One hue, cloth green, owning the binding, running heads, page heads, line numbers, sigla and the apparatus rule.
- Facing pages with a shared, clickable gutter of line numbers; a line lights on both pages and in its apparatus entry.
- Literata reads, Alegreya Sans SC labels, Fragment Mono quotes.
- Flat, square, hairline-ruled; tonal paper layers instead of shadows.
- Chapters turn like pages: a clip-path wipe, the old page holding still beneath.

## Colors

A single cloth green over cool paper and ink, with green-tinted greys for everything secondary.

### Primary
- **Bookcloth Green** (cloth): the binding (rail fill and the full-height band behind it), running heads, spread page heads, line numerals, file labels, sigla, the apparatus top rule, the `]` lemma bracket, loss levels, chapter numerals, focus rings, the scrollbar thumb, and the fill of a lit line number.
- **Spine Green** (cloth-d): the 6px spine on the rail's right edge (4px bottom edge when folded) and the install-command chip inside the rail.

### Neutral
- **Cool Paper** (paper): the page ground and the gutter column of every spread; also the current-chapter tab in the rail, so the open chapter reads as the page showing through the binding.
- **Leaf** (leaf): the faces of the verso and recto, and code blocks in an opening; one step lighter than paper so the pages sit on it.
- **Ink** (ink): all reading text and code.
- **Grey-Green Ink** (ink-2): secondary text: page-head notes, the gutter's "line" head, cut lines (`…`), glosses, turn directions, source paths.
- **Hairline** (rule): every 1px rule: running-head underline, spread border and page divisions, image borders, dotted leaders in lists.
- **Wash** (wash): the lit state of a line on both pages and of its apparatus entry; the only highlight in the system.
- **Rail Ink** (rail-ink): contents text on the binding.
- **Rail Sage** (rail-2): secondary text on the binding: edition statement, "Contents" head, chapter numerals, the folded contents summary.
- **Rail Line** (rail-line): dotted leaders under contents entries, link underlines and the scrollbar on the binding.
- **Selection Sage** (selection): text selection on the page (on the rail, selection inverts to paper on cloth).

### Named Rules
**The Binding Rule.** Green is the book's cloth and its marginalia, never the page. It fills only the rail and a lit line number; everywhere else it is a hairline, a numeral or a small-caps label.

**The One Hue Rule.** There is no second accent: no red, no amber, no status colours. Loss levels (mapped, approximated, unmapped) are set as green small capitals and distinguished by their words.

## Typography

**Display Font:** Literata (with Georgia, serif), variable, optical sizing on
**Body Font:** Literata (with Georgia, serif)
**Label Font:** Alegreya Sans SC (with Gill Sans, sans-serif), 500 and 700
**Mono Font:** Fragment Mono (with ui-monospace, Menlo, monospace)

**Character:** A bookish text serif carries the argument; a humanist sans with true small capitals plays the edition's running heads and sigla; a neutral mono sets the texts under study exactly as written.

### Hierarchy
- **Display** (600, clamp(1.9rem → 2.3rem), 1.14, -0.012em, balanced): the chapter title, preceded by its numeral in green at 400. One per chapter.
- **Wordmark** (Alegreya Sans SC 700, 1.55rem, 0.06em): "Markswift" at the head of the rail, in paper; 1.25rem in the folded bar.
- **Body** (400, 1.0625rem, 1.65): openings, capped at 66ch, `text-wrap: pretty`.
- **Body Small** (400, 0.9rem, 1.55): apparatus entries and the stages list (0.9rem, 1.4).
- **Gloss** (Literata italic, 0.8rem, 1.45, ink-2): reader instructions under the apparatus head. The edition statement on the rail uses the same italic at 0.875rem.
- **Label** (Alegreya Sans SC 500, 0.875rem, 0.04em): running heads, spread page heads (0.85rem), contents, turn links (1.1rem), file labels (0.8rem).
- **Label Strong** (Alegreya Sans SC 700, 0.8125–0.9rem, 0.08–0.12em, green or rail sage): section heads: "Contents", "Apparatus", "The six stages", "Floors"; apparatus sigla ("Losses", "Run", "Rule") at 0.8rem.
- **Code** (Fragment Mono 400, 0.78rem on a 1.34rem line): every spread line. Inline code is 0.84em of its context; ligatures off.
- **Line Number** (Fragment Mono 400, 0.72rem on the 1.34rem line, tabular): the gutter and the apparatus keys (0.75rem).

### Named Rules
**The Three Hands Rule.** Literata reads, Alegreya Sans SC labels, Fragment Mono quotes. A label is never set in the serif, reading text is never set in small caps, and only verbatim artifacts go in the mono.

**The Real Small Caps Rule.** Labels get their capitals from the Alegreya Sans SC face itself, written in sentence case. Never `text-transform: uppercase`, never all-caps strings.

**The Italic Is Editorial Rule.** Literata italic is reserved for the edition's own voice: the edition statement and the glosses. It is not used for emphasis in running text.

## Layout

Two columns at full width: a sticky 15.5rem binding (full viewport height, scrolling on its own) and the page, padded by the page margin and capped at 80rem. The binding's colour runs as a background band down the whole body, so it continues below the sticky rail.

A chapter is: running head (book and edition left, chapter right, hairline under), the opening (numbered title and a 66ch lede; chapter 1 adds a 15–20rem stages column at a 3.5rem gap), one spread, its apparatus, and the turn-the-page bar pinned to the foot.

The spread is a three-column grid: verso `minmax(0, min(26rem, 40%))`, gutter 3.25rem, recto `minmax(0, 1fr)`. Each row is one line on the 1.34rem rhythm, so verso, number and recto align across the gutter. Wrapped lines hang (a -2ch indent) and break only between tokens; source indentation is kept as `ch` steps from each page's own margin.

The apparatus is a 12rem head column beside entries set in two balanced columns (22rem minimum, 2.5rem gap); each entry is a 3.4rem key column then the reading.

Breakpoints:
- **Below 76rem:** the opening's side column drops beneath the lede (max 41rem, 1.5rem gap).
- **Below 64rem:** the binding folds into a top contents bar (wordmark left, a disclosure summary showing the current chapter right, 4px spine underneath); the edition statement, contents head and rail foot hide until the contents open.
- **Below 48rem:** the spread stacks: gutter 2.5rem and page pad 0.85rem; the verso runs first, then the recto under its own head, every line keeping its number; the apparatus becomes one column and the turn links stack.

### Named Rules
**The Facing Pages Rule.** The original is always on the verso and the translation always on the recto, sharing one gutter of numbers. On narrow screens the pages stack in that order; they never swap and never lose their numbers.

**The One Line Rule.** All spread text sits on the 1.34rem line. Nothing inside a spread may break that rhythm except images, which take whole rows.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth is tonal and ruled: leaf pages sit on paper, the gutter shows paper between two hairlines, the binding is a solid cloth band with a darker 6px spine at its edge, and the current chapter in the contents is a paper tab that runs through the spine to the page.

### Named Rules
**The Flat Page Rule.** Separation comes from a paper tone or a rule, never from a shadow, blur or glow. The only state change in depth is colour: wash on a lit line, cloth under a lit number.

## Shapes

Square. Every surface, page, chip, block and image has sharp corners; the single radius is the 2px on focus outlines. Rules are 1px hairlines in the rule colour, with one 2px green rule above each apparatus. Dotted 1px rules are leaders: under contents entries (rail line), stages and floors (rule). The only drawn glyph is the folded contents chevron, built from two 1.5px borders rotated 45°.

## Components

### Contents Rail
The book's binding: green cloth, paper wordmark, italic edition statement, then the contents as numbered entries with dotted leaders.
- **Entry:** Alegreya Sans SC, numeral right-aligned in a 1.1rem column in rail sage, title in rail ink over a dotted rail-line leader; 0.3rem 1.6rem padding.
- **Hover:** the leader becomes a solid rail-ink rule.
- **Current:** a paper tab with ink text and a green numeral, extended 6px through the spine so it joins the page; no leader.
- **Foot:** the install command in a spine-green chip (paper Fragment Mono 0.72rem, select-all), then GitHub, npm and Changelog links underlined in rail line.
- **Focus:** paper outline on the binding; green, inset, on the current tab.
- **Folded (below 64rem):** a horizontal bar; the summary reads the current chapter in paper with a chevron, and opens the full list.

### Running Head
Small-caps green line at the top of every page: "Markswift {version}" left, "{n} · {chapter}" right, a hairline beneath.

### Spread (signature)
Two pages and a gutter inside a 1px hairline frame. Each page opens with a small-caps green page head ("HTML · verso", "SwiftUI · recto") with a grey-green note at its right ("what you wrote", "what Markswift wrote"), ruled underneath. File labels (`## name` rows) are green small caps at 0.8rem. Cut lines (`…`, `// …`) are set in ink-2. Rendered images sit centred in their row, max 18rem, with a hairline border.

### Line Number
The gutter numeral is the control: green mono, centred, tabular, a radio input under each so it can be pointed at, clicked or reached with Tab and the arrow keys. Numbers keyed by an apparatus entry are underlined 1px (offset 3px).
- **Lit:** the number cell fills cloth with a leaf numeral; its lines on both pages and every apparatus entry keyed to it take the wash.
- **Focus:** 2px green outline inset by 1px.

### Apparatus
The notes at the foot, under a 2px green rule. Left: "Apparatus" in green small caps and an italic gloss. Right: entries in edition form, lemma `]` reading, the bracket in green. Each entry is keyed either by line numbers (green mono, clickable, lights its lines) or by a siglum in green small caps. Loss levels are green small caps. Numbers in readings use tabular lining figures.

### Turn the Page
A bar at the foot of every chapter under a hairline: "Turn back" left, "Turn the page" right, each a 0.8rem grey-green direction over the chapter number and title at 1.1rem; the forward title is green. Hover underlines the title 1px. The last chapter offers "Back to the start".

### Command Block
An install or run command in an opening: leaf ground, hairline border, square, Fragment Mono at 0.95rem, max 41rem.

### Links
Ink text with a 1px underline at 0.22em offset in half-strength cloth; hover brings the underline to full text colour. Inside lists that already carry leaders (contents, stages, turn bar) the underline is dropped and hover underlines the title instead.

### Motion
One authored motion: chapters turn like pages. Forward, the new page wipes in from the right edge; back, from the left (clip-path inset, 460ms, cubic-bezier(0.22, 1, 0.36, 1)); the old page holds still underneath; the binding does not move. Reduced motion removes the animation entirely.

## Do's and Don'ts

### Do:
- **Do** keep cloth green as the only hue: binding fill, lit number fill, and otherwise rules, numerals and small-caps labels.
- **Do** set the original on the verso and Markswift's output on the recto, sharing one numbered gutter on the 1.34rem line.
- **Do** give every correspondence and every loss an apparatus entry, written lemma `]` reading.
- **Do** use Literata for reading, Alegreya Sans SC for labels, Fragment Mono for verbatim artifacts and line numbers.
- **Do** separate surfaces with paper tones (paper, leaf) and 1px hairlines; use a 2px green rule only above the apparatus.
- **Do** mark a lit line with the wash on both pages and in the apparatus, and cloth behind its number.

### Don't:
- **Don't** introduce red or any second accent colour, including status colours for losses.
- **Don't** use condensed or grotesque display faces; chapter titles are Literata 600.
- **Don't** uppercase labels with `text-transform` or all-caps strings; the small capitals come from the face.
- **Don't** add shadows, blurs, glows or rounded corners (beyond the 2px focus radius).
- **Don't** open a chapter with a slogan or marketing hero; a chapter opens with its numeral, title and a short plain lede.
- **Don't** fold a chapter's evidence into a long table-heavy page; one stage, one spread.
