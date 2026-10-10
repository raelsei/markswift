/** Conversion-only HTTP API for a separately hosted static playground. */
import { ResultStore } from "./store.ts";
import { convertHandler, zipResponse } from "./convert.ts";
import { validatedOrigin } from "../origin.ts";

export interface PublicAppOptions {
  publicOrigin: string;
  workDirectory: string;
  maxConversionsPerMinute?: number;
}

export function createPublicApp(options: PublicAppOptions) {
  const origin = validatedOrigin(options.publicOrigin);
  const store = new ResultStore(options.workDirectory);
  const attempts = new Map<string, number[]>();
  const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  const headers = { ...cors, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
  const convert = convertHandler(store, json);
  const limited = (ip: string) => {
    const now = Date.now();
    const recent = (attempts.get(ip) ?? []).filter(t => now - t < 60_000);
    attempts.set(ip, recent);
    if (recent.length >= (options.maxConversionsPerMinute ?? 6)) return true;
    recent.push(now);
    return false;
  };

  return async (request: Request, clientIp = "unknown"): Promise<Response> => {
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
      if (limited(clientIp)) return json({ error: "Too many conversions. Try again in a minute." }, 429);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
      try { return await convert(body); } catch (error) {
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
