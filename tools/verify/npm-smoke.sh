#!/usr/bin/env bash
# Install the packed tarball into a fresh project and run it with Node only (no Bun on PATH).
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/markswift-npm-smoke.XXXXXX")"
trap 'rm -rf "$work"' EXIT
tarball="$(cd "$repo" && npm pack --silent --pack-destination "$work" | tail -n 1)"
shim="$work/bin"
mkdir -p "$shim"
for tool in node npm npx python3; do ln -s "$(command -v "$tool")" "$shim/$tool"; done
export PATH="$shim:/usr/bin:/bin"
if command -v bun >/dev/null; then echo "bun is still on PATH" >&2; exit 1; fi
cd "$work"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "./$tarball"
expected="$(node -p "require('$repo/package.json').version")"
test "$(npx --no-install markswift --version)" = "$expected"
node --input-type=module -e "const m = await import('markswift'); if (typeof m.convert !== 'function' || typeof m.compileLayout !== 'function') process.exit(1)"
node --input-type=module -e "const m = await import('markswift/compiler'); if (typeof m.compileLayout !== 'function') process.exit(1)"
echo '<div style="padding:16px;background:#2563eb;color:white">Hello</div>' | npx --no-install markswift convert - --name HelloCard --out hello
test "$(find hello -name '*.swift' | wc -l | tr -d ' ')" = 3
cp "$repo/tests/conformance/fixtures/assets/geist-latin-wght-normal.woff2" .
printf '%s' '<main data-markswift-root style="font-family:Geist;width:320px"><p>Geist text</p></main><style>@font-face{font-family:Geist;src:url(geist-latin-wght-normal.woff2) format("woff2");font-weight:100 900}</style>' > font.html
npx --no-install markswift convert font.html --name FontCard --out font
test -s font/Fonts/Geist.ttf
echo "npm smoke OK: markswift $expected under $(node --version) without Bun"
