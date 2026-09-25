/** Local static HTTP server for file-backed browser captures. */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";

export interface StaticServer {
  /** `http://127.0.0.1:<port>` */
  origin: string;
  addPage(key: string, html: string): string;
  mount(prefix: string, dir: string): string;
  stop(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

/** Serve `rootDir` on an ephemeral loopback port. Resolved paths must stay in their mount. */
export async function serveDir(rootDir: string): Promise<StaticServer> {
  const pages = new Map<string, string>();
  const mounts: Array<{ prefix: string; dir: string }> = [];
  const root = resolve(rootDir);
  const server = createServer((request, response) => {
    void (async () => {
      let path: string;
      try { path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname); }
      catch { response.writeHead(400).end("bad request"); return; }
      const page = /^\/__h2s\/page\/(.+)\.html$/.exec(path);
      if (page) {
        const html = pages.get(page[1]!);
        if (html === undefined) response.writeHead(404).end("no such page");
        else response.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }).end(html);
        return;
      }
      const mount = mounts.find((item) => path.startsWith(item.prefix + "/"));
      const base = mount?.dir ?? root;
      const suffix = mount ? path.slice(mount.prefix.length) : path;
      const local = resolve(base, "." + suffix);
      const rel = relative(base, local);
      if (rel === ".." || rel.startsWith(".." + sep) || rel.startsWith(sep)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      let entry;
      try { entry = await stat(local); }
      catch { response.writeHead(404).end("not found"); return; }
      if (!entry.isFile()) { response.writeHead(404).end("not found"); return; }
      response.writeHead(200, {
        "content-type": MIME[extname(local).toLowerCase()] ?? "application/octet-stream",
        "content-length": entry.size,
        "cache-control": "no-store",
      });
      createReadStream(local).on("error", () => response.destroy()).pipe(response);
    })().catch(() => { if (!response.headersSent) response.writeHead(500).end("server error"); else response.destroy(); });
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => { server.off("error", fail); done(); });
  });
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    addPage(key, html) {
      pages.set(key, html);
      return `${origin}/__h2s/page/${key}.html`;
    },
    mount(prefix, dir) {
      mounts.push({ prefix, dir: resolve(dir) });
      return origin + prefix;
    },
    stop() {
      return new Promise<void>((done, fail) => {
        server.close((error) => error ? fail(error) : done());
        server.closeAllConnections();
      });
    },
  };
}
