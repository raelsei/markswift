import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { LAYOUT_DOC_VERSION } from "../model/layout.ts";
import { VERSION } from "../model/version.ts";
import type { Capture } from "./capture.ts";

export const CAPTURE_CODE_VERSION = `v${VERSION}-ld${LAYOUT_DOC_VERSION}`;

/** Root directory for cached DOMSnapshot captures. */
export function getCacheDir(): string {
  if (process.env.MARKSWIFT_CACHE_DIR) return process.env.MARKSWIFT_CACHE_DIR;
  const base =
    process.env.XDG_CACHE_HOME ||
    (process.platform === "darwin" ? join(homedir(), "Library", "Caches") : join(homedir(), ".cache"));
  return join(base, "markswift", "captures");
}

let cachedBrowserVersion: string | undefined;

/** Memoized browser executable version string (e.g. "153.0.8010.12"). */
export function getBrowserVersion(channel = "chrome"): string {
  if (cachedBrowserVersion) return cachedBrowserVersion;
  try {
    const { chromium } = require("playwright-core");
    const exe = chromium.executablePath(channel === "chrome" ? "chrome" : undefined);
    const proc = Bun.spawnSync([exe, "--version"]);
    const out = proc.stdout.toString().trim();
    const ver = out.split(/\s+/).pop();
    if (ver && /^\d+/.test(ver)) {
      cachedBrowserVersion = ver;
      return ver;
    }
  } catch {}
  cachedBrowserVersion = "chromium";
  return cachedBrowserVersion;
}

export function setCachedBrowserVersion(ver: string): void {
  if (ver) cachedBrowserVersion = ver;
}

/**
 * Scans HTML and injected CSS for local relative links (stylesheets, images, fonts),
 * reads their contents from disk if baseDir is provided, and computes a single content hash.
 * If any linked resource on disk changes, this hash changes, preventing stale cache hits.
 */
export async function hashLinkedResources(html: string, baseDir?: string, css?: string): Promise<string> {
  if (!baseDir) return "";
  const visited = new Set<string>();
  const hashes: Array<{ path: string; hash: string }> = [];

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

  const processFile = async (relPath: string) => {
    const clean = relPath.split(/[?#]/)[0]!.trim();
    if (
      !clean ||
      clean.startsWith("data:") ||
      clean.startsWith("http:") ||
      clean.startsWith("https:") ||
      clean.startsWith("//")
    ) {
      return;
    }
    const full = resolve(baseDir, clean);
    if (visited.has(full)) return;
    visited.add(full);
    try {
      const content = await readFile(full);
      const h = createHash("sha256").update(content).digest("hex").slice(0, 16);
      hashes.push({ path: clean, hash: h });
      if (clean.endsWith(".css")) {
        const subUrls = scanUrls(content.toString("utf8"));
        for (const sub of subUrls) {
          const subRel = relative(baseDir, resolve(dirname(full), sub.split(/[?#]/)[0]!.trim()));
          await processFile(subRel);
        }
      }
    } catch {
      // Missing or unreadable file is omitted from linked hashes.
    }
  };

  const urls = scanUrls(html);
  if (css) urls.push(...scanUrls(css));
  for (const u of urls) await processFile(u);

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
