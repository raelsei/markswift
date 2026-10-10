import { join } from "node:path";
import { renderInput, allowRequest } from "./request.ts";
import { NativeStore } from "./native-store.ts";
import { convertHandler, zipResponse } from "./convert.ts";

export function createApp(port: number, workDirectory: string, nativePreview: boolean) {
  const store = new NativeStore(workDirectory);
  const publicDir = join(import.meta.dir, "../public");
  const assets: Record<string, string> = { "/": "index.html", "/styles.css": "styles.css", "/config.js": "config.js", "/app.js": "app.js", "/sample.js": "sample.js" };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const convert = convertHandler(store, json);
  return async (request: Request): Promise<Response> => {
    if (!allowRequest(request, port)) return json({ error: "This request is not allowed by the local playground." }, 403);
    const path = new URL(request.url).pathname;
    try {
      if (request.method === "GET" && path === "/api/capabilities") return json({ convert: true, nativePreview });
      if (request.method === "GET" && assets[path]) {
        return new Response(Bun.file(join(publicDir, assets[path])), { headers: { "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" } });
      }
      if (request.method === "POST" && path === "/api/convert") return await convert(await request.json(), { signal: request.signal });
      if (request.method === "POST" && path === "/api/render") {
        const parsed = renderInput.safeParse(await request.json());
        if (!parsed.success) return json({ error: "Choose a valid conversion." }, 400);
        return json(store.render(parsed.data.id), 202);
      }
      const match = /^\/api\/(jobs|image|download)\/([a-f0-9-]{36})$/.exec(path);
      if (request.method === "GET" && match) {
        const kind = match[1], id = match[2]!;
        try { store.get(id); } catch (error) { return json({ error: (error as Error).message }, 404); }
        if (kind === "jobs") return json(store.state(id));
        if (kind === "image") return new Response(store.image(id), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
        return await zipResponse(store, id, { "Cache-Control": "no-store" });
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, error instanceof SyntaxError ? 400 : 500);
    }
  };
}
