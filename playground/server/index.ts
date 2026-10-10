import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createApp } from "./app.ts";
import { nativePreviewAvailable } from "./native-store.ts";
import { sweepResults } from "./store.ts";

const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT must be between 1024 and 65535");
const work = process.env.MARKSWIFT_WORK_DIR ?? join(import.meta.dir, "../.cache");
await mkdir(work, { recursive: true });
await sweepResults(work);
const nativePreview = await nativePreviewAvailable();
const server = Bun.serve({ hostname: "127.0.0.1", port, idleTimeout: 120, maxRequestBodySize: 1_000_000, fetch: createApp(port, work, nativePreview) });
console.log(`Markswift Playground: http://127.0.0.1:${server.port}`);
console.log(nativePreview
  ? "Native preview: iOS Simulator available. Press Ctrl+C to stop."
  : "Native preview disabled: requires Xcode and an iOS 18+ iPhone Simulator. Press Ctrl+C to stop.");
