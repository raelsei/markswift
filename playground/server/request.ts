import { z } from "zod";

export const conversionInput = z.object({
  html: z.string().min(1, "HTML must not be empty.").max(500_000),
  css: z.string().max(200_000).default(""),
  name: z.string().regex(/^[A-Z][A-Za-z0-9_]{0,79}$/, "Component name must start with an uppercase letter."),
  width: z.number().int().min(100).max(1600),
  height: z.number().int().min(100).max(2000),
  theme: z.enum(["adaptive", "light", "dark"]),
  mode: z.enum(["app", "fidelity"]),
});
export const renderInput = z.object({ id: z.string().uuid() });

/** Only this loopback UI can start browser capture or native compilation. */
export function allowRequest(request: Request, port: number): boolean {
  const url = new URL(request.url);
  const validHost = (host: string) => host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  if (!validHost(url.host)) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  return request.method !== "POST" || request.headers.get("content-type")?.split(";")[0] === "application/json";
}
