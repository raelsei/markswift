import { basename, dirname, resolve } from "node:path";
import { serveDir } from "./server.ts";
import type { HtmlSource } from "./types.ts";

export interface ResolvedSource {
  html?: string;
  url: string;
  label: string;
  close(): void;
}

/** Resolve source-relative assets and own any temporary HTTP serving for this source. */
export async function resolveSource(source: HtmlSource): Promise<ResolvedSource> {
  if ("url" in source) {
    const url = httpURL(source.url);
    return { url, label: url, close() {} };
  }
  if ("file" in source) {
    const file = resolve(source.file);
    const html = await Bun.file(file).text();
    const server = serveDir(dirname(file));
    return {
      html,
      url: `${server.origin}/${encodeURIComponent(basename(file))}`,
      label: basename(file),
      close: () => server.stop(),
    };
  }
  if (source.baseURL && source.assetsDir) throw new Error("choose baseURL or assetsDir, not both");
  const server = source.assetsDir ? serveDir(resolve(source.assetsDir)) : undefined;
  return {
    html: source.html,
    url: source.baseURL ? httpURL(source.baseURL) : `${server?.origin ?? "http://markswift.invalid"}/index.html`,
    label: "inline.html",
    close: () => server?.stop(),
  };
}

function httpURL(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("only http and https page URLs are supported");
  return url.href;
}
