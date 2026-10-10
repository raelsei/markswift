import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createPublicApp } from "./public-app.ts";
import { sweepResults } from "./store.ts";

const publicOrigin = process.env.MARKSWIFT_PUBLIC_ORIGIN;
if (!publicOrigin) throw new Error("Set MARKSWIFT_PUBLIC_ORIGIN to the deployed static site's origin");
const port = Number(process.env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT must be between 1024 and 65535");
const workDirectory = process.env.MARKSWIFT_WORK_DIR ?? join(import.meta.dir, ".cache");
await mkdir(workDirectory, { recursive: true });
await sweepResults(workDirectory);
const app = createPublicApp({ publicOrigin, workDirectory });
const server = Bun.serve({
  hostname: "0.0.0.0", port, idleTimeout: 120, maxRequestBodySize: 1_000_000,
  fetch(request, server) { return app(request, server.requestIP(request)?.address ?? "unknown"); },
});
console.log(`Markswift conversion API listening on ${server.port}; allowed frontend: ${publicOrigin}`);
