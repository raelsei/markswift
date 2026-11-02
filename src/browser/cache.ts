import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { LAYOUT_DOC_VERSION } from "../model/layout.ts";
import { VERSION } from "../model/version.ts";
import type { Capture } from "./capture.ts";

/**
 * The capture code's identity: the package version plus a hash of the code next to this module (src/browser/* from
 * source, the bundle in dist/), so an edit to the capture scripts invalidates entries even within one version.
 */
function codeHash(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const hash = createHash("sha256");
    for (const name of readdirSync(dir)
      .filter((f) => /\.(ts|js)$/.test(f))
      .sort())
      hash.update(name).update(readFileSync(join(dir, name)));
    return hash.digest("hex").slice(0, 16);
  } catch {
    // ponytail: a compiled binary's embedded files cannot be listed; its release version already pins the code.
    return "release";
  }
}

export const CAPTURE_CODE_VERSION = `v${VERSION}-ld${LAYOUT_DOC_VERSION}-${codeHash()}`;

/** Root directory for cached DOMSnapshot captures. */
export function getCacheDir(): string {
  if (process.env.MARKSWIFT_CACHE_DIR) return process.env.MARKSWIFT_CACHE_DIR;
  const base =
    process.env.XDG_CACHE_HOME ||
    (process.platform === "darwin" ? join(homedir(), "Library", "Caches") : join(homedir(), ".cache"));
  return join(base, "markswift", "captures");
}

const browserVersions = new Map<string, string | undefined>();

/** Stable Google Chrome's install path (Playwright's `chrome` channel); other channels are not resolved. */
const CHROME: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/opt/google/chrome/chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

/**
 * Version of the browser a capture would launch (`launchBrowser`'s choice: the channel, default Chrome on macOS with
 * Playwright's Chromium as fallback), read without launching it. Undefined when no executable answers, or for a
 * channel other than `chrome`: the capture then skips the cache rather than key entries by an unknown browser.
 */
export function getBrowserVersion(channel?: string): string | undefined {
  const key = channel ?? "";
  if (browserVersions.has(key)) return browserVersions.get(key);
  const preferred = channel ?? (process.platform === "darwin" ? "chrome" : undefined);
  const candidates = [preferred, ...(channel === undefined && preferred ? [undefined] : [])];
  let version: string | undefined;
  for (const c of candidates) {
    const exe = c === undefined ? chromium.executablePath() : c === "chrome" ? CHROME[process.platform] : undefined;
    if (!exe) continue;
    try {
      const out = execFileSync(exe, ["--version"], { encoding: "utf8", timeout: 10_000 });
      version = out.trim().split(/\s+/).pop();
      if (version && /^\d/.test(version)) break;
      version = undefined;
    } catch {}
  }
  browserVersions.set(key, version);
  return version;
}

/**
 * One hash over the local files the document links (stylesheets, images, fonts, and what stylesheets import), read
 * from disk: an edit to any of them misses the cache. `root` is the directory served at `/`, `docDir` the
 * document's own. Undefined when a link cannot be hashed (missing file, remote URL inside a stylesheet): the
 * capture is then not cached, since nothing would notice that resource change.
 */
export async function hashLinkedResources(
  html: string,
  root?: string,
  css?: string,
  docDir = root,
): Promise<string | undefined> {
  if (!root || !docDir) return "";
  const visited = new Set<string>();
  const hashes: Array<{ path: string; hash: string }> = [];
  let unhashable = false;

  const scanUrls = (content: string): string[] => {
    const urls: string[] = [];
    const re = /(?:href|src)\s*=\s*["']([^"'>\s]+)["']|url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const u = m[1] ?? m[2] ?? m[3];
      if (u) urls.push(u);
    }
    return urls;
  };

  const processFile = async (url: string, from: string) => {
    const clean = url.split(/[?#]/)[0]!.trim();
    if (!clean || clean.startsWith("data:") || clean.startsWith("#")) return;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) {
      unhashable = true;
      return;
    }
    const full = clean.startsWith("/") ? resolve(root, `.${decodeURI(clean)}`) : resolve(from, decodeURI(clean));
    if (visited.has(full)) return;
    visited.add(full);
    try {
      const content = await readFile(full);
      hashes.push({ path: relative(root, full), hash: createHash("sha256").update(content).digest("hex") });
      if (full.endsWith(".css"))
        for (const sub of scanUrls(content.toString("utf8"))) await processFile(sub, dirname(full));
    } catch {
      unhashable = true;
    }
  };

  for (const u of [...scanUrls(html), ...(css ? scanUrls(css) : [])]) await processFile(u, docDir);
  if (unhashable) return undefined;
  if (!hashes.length) return "";
  hashes.sort((a, b) => a.path.localeCompare(b.path));
  return createHash("sha256")
    .update(hashes.map((h) => `${h.path}:${h.hash}`).join("\n"))
    .digest("hex");
}

export interface CacheKeyParams {
  html: string;
  linkedResources?: string;
  viewport: { width: number; height: number };
  theme: string;
  browserVersion: string;
  captureCodeVersion?: string;
  /** `LayoutDoc.source` label and screen name: both are written into the capture. */
  source?: string;
  screen?: string;
  dpr?: number;
  restricted?: boolean;
  root?: string;
  waitFor?: string;
  css?: string;
  darkClass?: string;
  open?: string;
  probeDismiss?: boolean;
  screenshot?: boolean;
  breakpoints?: boolean;
}

export function computeCacheKey(p: CacheKeyParams): string {
  const parts = [
    "markswift-capture-v1",
    p.html,
    p.linkedResources ?? "",
    `${p.viewport.width}x${p.viewport.height}`,
    p.theme,
    p.browserVersion,
    p.captureCodeVersion ?? CAPTURE_CODE_VERSION,
    p.root ?? "",
    p.waitFor ?? "",
    p.css ?? "",
    p.darkClass ?? "",
    p.open ?? "",
    p.probeDismiss ? "1" : "0",
    p.screenshot ? "1" : "0",
    p.breakpoints ? "1" : "0",
    p.source ?? "",
    p.screen ?? "",
    String(p.dpr ?? ""),
    p.restricted ? "1" : "0",
  ];
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

export async function readCaptureCache(key: string, cacheDir?: string): Promise<Capture | undefined> {
  const dir = cacheDir ?? getCacheDir();
  const file = join(dir, `${key}.json`);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CAPTURE_CODE_VERSION || !parsed.layout) return undefined;
    const capture: Capture = {
      layout: parsed.layout,
      warnings: parsed.warnings ?? [],
      fontFiles: (parsed.fontFiles ?? []).map((f: { file: string; data: string }) => ({
        file: f.file,
        bytes: new Uint8Array(Buffer.from(f.data, "base64")),
      })),
      triggers: parsed.triggers,
      opened: parsed.opened,
      png: parsed.png ? new Uint8Array(Buffer.from(parsed.png, "base64")) : undefined,
    };
    return capture;
  } catch {
    return undefined;
  }
}

export async function writeCaptureCache(key: string, capture: Capture, cacheDir?: string): Promise<void> {
  const dir = cacheDir ?? getCacheDir();
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${key}.json`);
  const tmp = join(dir, `${key}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  const record = {
    version: CAPTURE_CODE_VERSION,
    layout: capture.layout,
    warnings: capture.warnings,
    fontFiles: capture.fontFiles.map((f) => ({
      file: f.file,
      data: Buffer.from(f.bytes).toString("base64"),
    })),
    triggers: capture.triggers,
    opened: capture.opened,
    png: capture.png ? Buffer.from(capture.png).toString("base64") : undefined,
  };
  await writeFile(tmp, JSON.stringify(record));
  await rename(tmp, file);
}

/** Deletes all cached capture entries from the cache dir. Returns the count of deleted files. */
export async function clearCaptureCache(cacheDir?: string): Promise<number> {
  const dir = cacheDir ?? getCacheDir();
  let count = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".json")) {
        await rm(join(dir, e.name), { force: true });
        count++;
      }
    }
  } catch {}
  return count;
}
