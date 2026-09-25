/** Local same-origin web and API server; static builds remain independently deployable. */
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";
import { handleRequest, HTTP_IDLE_TIMEOUT_SECONDS } from "./service/app.ts";

const web = resolve(fileURLToPath(new URL("./web/", import.meta.url)));
const port = Number(process.env.PORT ?? "4325");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a TCP port");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2",
};

Bun.serve({
  hostname: "127.0.0.1",
  port,
  idleTimeout: HTTP_IDLE_TIMEOUT_SECONDS,
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/health" || pathname.startsWith("/api/")) return handleRequest(request);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return new Response("Bad path", { status: 400 }); }
    const filePath = resolve(web, "." + (decoded === "/" ? "/index.html" : decoded));
    if (!filePath.startsWith(web + sep)) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : file, {
      headers: { "Content-Type": types[extname(filePath)] ?? "application/octet-stream", "Cache-Control": "no-store" },
    });
  },
});
console.log(`Playground http://127.0.0.1:${port}`);
