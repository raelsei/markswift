import { createPlaygroundHandler, HTTP_IDLE_TIMEOUT_SECONDS } from "./app.ts";

const port = Number(process.env.PLAYGROUND_PORT ?? process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PLAYGROUND_PORT or PORT must be a valid port number.");

const server = Bun.serve({
  hostname: process.env.PLAYGROUND_HOST ?? "0.0.0.0",
  port,
  idleTimeout: HTTP_IDLE_TIMEOUT_SECONDS,
  fetch: createPlaygroundHandler(),
});

console.log(`Markswift playground API listening on ${server.url}`);
