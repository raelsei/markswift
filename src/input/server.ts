/** Static file server over http://127.0.0.1 for capture pages (ES modules and fetch fail under file://). */
import { resolve } from "node:path";

export interface StaticServer {
  /** `http://127.0.0.1:<port>` */
  origin: string;
  stop(): void;
}

/**
 * Serve `rootDir` on an ephemeral port. Refused: a Host other than this server's own
 * `127.0.0.1:<port>` (403, DNS rebinding), malformed percent-encoding (400), any dot-segment
 * such as `.env` or `.git/` (404), and paths resolving outside the root (403).
 */
export function serveDir(rootDir: string): StaticServer {
  const root = resolve(rootDir);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req, server) {
      if (req.headers.get("host") !== `127.0.0.1:${server.port}`) return new Response("forbidden", { status: 403 });
      let path: string;
      try {
        path = decodeURIComponent(new URL(req.url).pathname);
      } catch {
        return new Response("bad request", { status: 400 });
      }
      if (path.split("/").some((s) => s.startsWith("."))) return new Response("not found", { status: 404 });
      const local = resolve(root, "." + path);
      if (local !== root && !local.startsWith(root + "/")) return new Response("forbidden", { status: 403 });
      return fileResponse(local);
    },
  });

  return {
    origin: `http://127.0.0.1:${server.port}`,
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
