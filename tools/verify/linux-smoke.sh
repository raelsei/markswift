#!/usr/bin/env bash
# Smoke test for Linux capture and codegen: verifies markswift convert with HTML/SVG,
# webfonts, and standalone compiled binary on Linux without Xcode or macOS dependencies.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/markswift-linux-smoke.XXXXXX")"
trap 'rm -rf "$work"' EXIT

cd "$repo"
expected="$(bun -e "import pkg from './package.json'; console.log(pkg.version)")"

# 1. Direct conversion of HTML with SVG
bun run src/cli.ts convert tests/conformance/fixtures/svg/svg-rect.html --name RectView --out "$work/rect"
test -f "$work/rect/RectView.swift"
test -f "$work/rect/MarkswiftRuntime.swift"

# 2. Conversion of HTML with @font-face (WOFF2 font conversion via python3/fontTools)
cp "$repo/tests/conformance/fixtures/assets/geist-latin-wght-normal.woff2" "$work/geist.woff2"
printf '%s' '<main data-markswift-root style="font-family:Geist;width:320px"><p>Geist text</p></main><style>@font-face{font-family:Geist;src:url(geist.woff2) format("woff2");font-weight:100 900}</style>' > "$work/font.html"
bun run src/cli.ts convert "$work/font.html" --name FontView --out "$work/font"
test -s "$work/font/Fonts/Geist.ttf"

# 3. Compile standalone binary for current host and test conversion with it
bun build --compile --external chromium-bidi --outfile "$work/markswift-bin" src/cli.ts
actual="$("$work/markswift-bin" --version)"
test "$actual" = "$expected"
"$work/markswift-bin" convert tests/conformance/fixtures/svg/svg-rect.html --name BinView --out "$work/bin-rect"
test -f "$work/bin-rect/BinView.swift"
test -f "$work/bin-rect/MarkswiftRuntime.swift"

echo "linux smoke OK: markswift $expected capture, webfonts and binary conversion passed"
