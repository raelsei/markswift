/** Conversion-only HTTP API for a separately hosted static playground. */
import { ResultStore } from "./store.ts";
import { convertHandler, zipResponse } from "./convert.ts";
import { validatedOrigin } from "../origin.ts";

export interface PublicAppOptions {
  publicOrigin: string;
  workDirectory: string;
  maxConversionsPerMinute?: number;
  /** Address of the reverse proxy whose `X-Forwarded-For` entry names the client. */
  trustedProxy?: string;
}

/** Sliding one-minute window per key. Keys without recent hits are deleted; at most `maxKeys` keys are kept (oldest evicted). */
export function rateLimiter(maxPerMinute: number, maxKeys = 10_000): { limited(key: string, now?: number): boolean; size(): number } {
  const hits = new Map<string, number[]>();
  return {
    limited(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter(t => now - t < 60_000);
      hits.delete(key);
      if (recent.length >= maxPerMinute) {
        hits.set(key, recent);
        return true;
      }
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value!);
      hits.set(key, [...recent, now]);
      return false;
    },
    size: () => hits.size,
  };
}

/** The socket peer, or — only when the peer is the configured proxy — the right-most X-Forwarded-For entry it appended. */
export function clientIp(request: Request, peer: string | undefined, trustedProxy?: string): string {
  const forwarded = peer && peer === trustedProxy ? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() : undefined;
  return forwarded || peer || "unknown";
}

export function createPublicApp(options: PublicAppOptions) {
  const origin = validatedOrigin(options.publicOrigin);
  const store = new ResultStore(options.workDirectory);
  const limiter = rateLimiter(options.maxConversionsPerMinute ?? 6);
  const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  const headers = { ...cors, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
  const convert = convertHandler(store, json);

  return async (request: Request, peer?: string): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") return json({ ok: true });
    const download = /^\/api\/download\/([a-f0-9-]{36})$/.exec(path);
    if (request.headers.get("origin") !== origin && !(request.method === "GET" && download)) {
      return Response.json({ error: "Origin is not allowed." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET" && path === "/api/capabilities") return json({ convert: true, nativePreview: false });
    if (request.method === "POST" && path === "/api/convert") {
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Expected JSON." }, 415);
      const ip = clientIp(request, peer, options.trustedProxy);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      try { return await convert(body, { admit: () => !limiter.limited(ip), signal: request.signal }); } catch (error) {
        console.error("Conversion failed:", error);
        return json({ error: "Conversion failed. Check the HTML and try again." }, 422);
      }
    }
    if (request.method === "GET" && download) {
      try { return await zipResponse(store, download[1]!, headers); }
      catch { return json({ error: "Conversion expired. Convert again to download." }, 404); }
    }
    return json({ error: "Not found." }, 404);
  };
}
