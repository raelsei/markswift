# Markswift Playground

A compact HTML/CSS → SwiftUI workbench. The hosted edition has a static frontend and a separate conversion API. It does not expose the local iOS Simulator preview. The browser preview updates as you edit; conversion and ZIP download require the API.

Deploy generated `dist/` as a separate static site and generated `dist-service/` as a separate Bun service. Neither artifact needs the library source tree at runtime, and the service bundle contains no native (Xcode/Simulator) code.

## Local development

From the repository root:

```sh
bun install --frozen-lockfile
bun run --cwd playground dev
```

Open `http://127.0.0.1:4317`. The local server uses Bun and Google Chrome for conversion. Its optional **Render SwiftUI** panel additionally needs macOS, Xcode and an iOS 18+ iPhone Simulator; it is hidden when the server finds no simulator at startup. The local server listens on `127.0.0.1` only. Set `PORT` to use another local port and `MARKSWIFT_WORK_DIR` to move its work directory (default `playground/.cache`). Result directories left there by an earlier run are swept on startup; the simulator cache (`native/`) and `checks/` are kept.

Local and hosted conversion use the same policy as the browser preview: pasted markup runs no scripts and loads no remote resources (images, stylesheets, fonts). Use the CLI to convert local files or live URLs.

## Static frontend

Build with the HTTPS origin of the separate conversion service:

```sh
MARKSWIFT_API_URL=https://api.example.com bun run --cwd playground build
```

Upload the contents of `playground/dist/` to Cloudflare Pages or GitHub Pages. Assets use relative paths, so a GitHub Pages project subpath works. Cloudflare Pages supports [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) of the prebuilt folder. Choose Pages project setup deliberately: Cloudflare says a Direct Upload project cannot later be switched to Git integration. The build requires `MARKSWIFT_API_URL`; a missing value fails instead of publishing a broken Convert button.

`config.js` is generated into `dist/` with the API origin and native preview disabled. It contains no secret. The UI checks `/api/capabilities`; when the API is unreachable it keeps the browser preview available, disables conversion with a visible explanation and offers **Retry**.

The Content Security Policy is a `<meta>` tag in `index.html` (GitHub Pages ignores `_headers`); the build adds the API origin to its `connect-src`.

## Conversion service

Build a standalone service package from the repository root:

```sh
bun run --cwd playground build:service
```

Copy `playground/dist-service/` to a separate host that can execute Bun and Google Chrome, then run:

```sh
cd dist-service
bun install --production
MARKSWIFT_PUBLIC_ORIGIN=https://playground.example.com PORT=4318 bun server.js
```

`dist-service/` contains a bundled API, `convert-font.py` and a package manifest with the matching `playwright-core` version pinned. Set `MARKSWIFT_PUBLIC_ORIGIN` to the exact **origin** of the Pages site. Expose the API through HTTPS on the origin used for `MARKSWIFT_API_URL`. The service binds to `0.0.0.0`; put it behind a reverse proxy. It needs a writable work directory (`MARKSWIFT_WORK_DIR` can override the default), `/usr/bin/zip` for downloads, and Python `fontTools`/`brotli` if data-URL webfonts need conversion. `GET /health` is available for a host health check.

The hosted API accepts pasted HTML and compiled CSS only. It blocks source scripts and outbound browser resource requests, including remote images, stylesheets and fonts. Inline CSS and data-URL assets can be used. The request limit is 1 MB. Conversions are queued and run one at a time, at most 3 in flight (one running, two waiting); further requests get a 429, and a queued request whose client disconnected is skipped. A small in-memory per-IP limit (6 per minute, bounded key count) is applied after the capacity check, so a busy rejection does not use quota. The most recent 12 results remain in memory for ZIP downloads; each ZIP is built once from validated bundle paths. Results expire when the process restarts (their directories are swept on startup) or the store rolls over. No native rendering endpoint is exposed.

**Before exposing the API publicly**, run Chrome as a non-root user in an isolated host/container with network egress restricted, CPU/memory limits and an upstream request limit. The application-level browser route and CSP are additional defenses, not a substitute for OS-level isolation. The service currently does not provide user accounts, durable jobs or multi-instance shared storage. Behind a reverse proxy every request arrives from the proxy's address: set `MARKSWIFT_TRUSTED_PROXY` to that address so the per-IP limit uses the right-most `X-Forwarded-For` entry the proxy appends. Requests from any other peer keep their socket address. If your proxy hides client IPs, its own rate limiting is especially important.

## Checks

```sh
bun run --cwd playground test
bun run typecheck
bun run test:browser
```

For the full local Chrome + iOS Simulator workflow, start the local server and run `bun playground/tests/browser-check.ts`. The static frontend was also exercised locally on a separate origin against the **exported standalone service**, including ZIP download, mobile layout and API-offline behavior.
