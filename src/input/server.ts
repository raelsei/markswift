/** Static file server over http://127.0.0.1 for capture pages (ES modules and fetch fail under file://). */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { mimeType } from "./mime.ts";

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
export async function serveDir(rootDir: string): Promise<StaticServer> {
  const root = resolve(rootDir);
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: string) => res.writeHead(status, { "content-type": "text/plain" }).end(body);
    const { port } = server.address() as AddressInfo;
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(403, "forbidden");
    let path: string;
    try {
      // Parsing against a base normalises `..` before the containment check below.
      path = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
      return reply(400, "bad request");
    }
    if (path.split("/").some((s) => s.startsWith("."))) return reply(404, "not found");
    const local = resolve(root, "." + path);
    if (local !== root && !local.startsWith(root + "/")) return reply(403, "forbidden");
    const info = await stat(local).catch(() => undefined);
    if (!info?.isFile()) return reply(404, "not found");
    res.writeHead(200, { "content-type": mimeType(local), "content-length": info.size, "cache-control": "no-store" });
    createReadStream(local).pipe(res);
  });
  await new Promise<void>((done, fail) => server.once("error", fail).listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    stop() {
      server.closeAllConnections();
      server.close();
    },
  };
}
