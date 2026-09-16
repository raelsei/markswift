/**
 * Static file server over http://127.0.0.1 for capture pages (ES modules and
 * fetch fail under file://). Serves a root directory, optional extra mounts
 * (`/__h2s/vendor` → vendored CDN scripts, `/__h2s/fonts` → local fonts) and
 * in-memory pages at `/__h2s/page/<key>.html`.
 */
import { resolve } from "node:path";

export interface StaticServer {
  /** `http://127.0.0.1:<port>` */
  origin: string;
  /** Register an in-memory page; returns its URL. */
  addPage(key: string, html: string): string;
  /** Serve `dir` under URL `prefix` (e.g. `/__h2s/vendor`); returns the mount's base URL. */
  mount(prefix: string, dir: string): string;
  stop(): void;
}

/** Serve `rootDir` on an ephemeral port. Requests resolving outside a served directory are refused. */
export function serveDir(rootDir: string): StaticServer {
  const pages: Record<string, string> = {};
  const mounts: Array<{ prefix: string; dir: string }> = [];
  const root = resolve(rootDir);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      const page = /^\/__h2s\/page\/(.+)\.html$/.exec(path);
      if (page) {
        const html = pages[page[1]!];
        return html === undefined
          ? new Response("no such page", { status: 404 })
          : new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      const m = mounts.find((x) => path.startsWith(x.prefix + "/"));
      const base = m ? m.dir : root;
      const rel = m ? path.slice(m.prefix.length) : path;
      const local = resolve(base, "." + rel);
      if (local !== base && !local.startsWith(base + "/")) return new Response("forbidden", { status: 403 });
      return fileResponse(local);
    },
  });

  const origin = `http://127.0.0.1:${server.port}`;
  return {
    origin,
    addPage(key, html) {
      pages[key] = html;
      return `${origin}/__h2s/page/${key}.html`;
    },
    mount(prefix, dir) {
      mounts.push({ prefix, dir: resolve(dir) });
      return origin + prefix;
    },
    stop() {
      server.stop(true);
    },
  };
}

async function fileResponse(path: string): Promise<Response> {
  const f = Bun.file(path);
  if (!(await f.exists())) return new Response("not found", { status: 404 });
  return new Response(f, { headers: { "cache-control": "no-store" } });
}
