import type { ConvertOptions } from "./core.ts";
import { conversionOptions, InputError, parseConversionInput } from "./input.ts";
import { convertIsolated, WorkerError } from "./isolated.ts";
import { serializeResult, type PublicResult, type ServiceResult } from "./output.ts";

type Converter = (source: { html: string }, options: ConvertOptions) => Promise<PublicResult>;

export interface PlaygroundServiceOptions {
  /** Exact origin of a separately hosted static playground, for example https://playground.example.com. */
  allowedOrigin?: string;
  /** Maximum number of simultaneous browser conversions. */
  maxConcurrent?: number;
  /** Limit the JSON request body before parsing. */
  maxBodyBytes?: number;
  /** Deadline for receiving the complete request body. */
  bodyTimeoutMs?: number;
  /** Hard deadline for the isolated Chrome conversion process. */
  conversionTimeoutMs?: number;
  /** Test seam; production uses an isolated worker importing markswift's public API. */
  convert?: Converter;
  /** Receives internal failures without exposing them to the browser. */
  logError?: (error: unknown) => void;
}

const DEFAULT_BODY_BYTES = 1024 * 1024;
/** Longer than the conversion deadline, so Bun keeps the HTTP response open. */
export const HTTP_IDLE_TIMEOUT_SECONDS = 75;

export function createPlaygroundHandler(options: PlaygroundServiceOptions = {}): (request: Request) => Promise<Response> {
  const allowedOrigin = options.allowedOrigin ?? process.env.PLAYGROUND_ORIGIN;
  const maxConcurrent = options.maxConcurrent ?? 2;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_BODY_BYTES;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? 10_000;
  const conversionTimeoutMs = options.conversionTimeoutMs ?? 60_000;
  if (allowedOrigin && (!/^https?:\/\/[^/]+$/.test(allowedOrigin) || new URL(allowedOrigin).origin !== allowedOrigin)) {
    throw new Error("PLAYGROUND_ORIGIN must be a single HTTP(S) origin without a path.");
  }
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || !Number.isInteger(maxBodyBytes) || maxBodyBytes < 1
    || !Number.isInteger(bodyTimeoutMs) || bodyTimeoutMs < 1 || !Number.isInteger(conversionTimeoutMs) || conversionTimeoutMs < 1) {
    throw new Error("Service limits must be positive integers.");
  }
  let active = 0;

  return async request => {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get("origin");
    const sameOrigin = !origin || origin === new URL(request.url).origin;
    const permitted = sameOrigin || origin === allowedOrigin;
    const corsHeaders = new Headers({ "Vary": "Origin", "Cache-Control": "no-store" });
    if (origin && permitted) {
      corsHeaders.set("Access-Control-Allow-Origin", origin);
      corsHeaders.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      corsHeaders.set("Access-Control-Allow-Headers", "Content-Type");
    }
    const json = (body: object, status = 200, headers?: HeadersInit): Response => {
      const combined = new Headers(corsHeaders);
      if (headers) new Headers(headers).forEach((value, key) => combined.set(key, value));
      return Response.json(body, { status, headers: combined });
    };

    if (path === "/health" && request.method === "GET") return json({ status: "ok" });
    if (path !== "/api/convert" && path !== "/health") return json({ error: "Not found." }, 404);
    if (!permitted) return json({ error: "Origin is not allowed." }, 403);
    if (path === "/health") return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { Allow: "POST, OPTIONS" });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return json({ error: "Content-Type must be application/json." }, 400);
    }
    if (active >= maxConcurrent) return json({ error: "Too many conversions are running. Try again shortly." }, 429, { "Retry-After": "2" });
    active++;
    try {
      const body = await readBoundedBody(request, maxBodyBytes, bodyTimeoutMs);
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
      catch { throw new InputError("Request body must be valid UTF-8 JSON."); }
      const input = parseConversionInput(parsed);
      let result: ServiceResult;
      if (options.convert) result = serializeResult(await options.convert({ html: input.html }, conversionOptions(input)));
      else result = await convertIsolated(input, { timeoutMs: conversionTimeoutMs, signal: request.signal });
      return json(result);
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, error.status);
      if (error instanceof WorkerError && error.status !== 500) return json({ error: error.message }, error.status);
      (options.logError ?? console.error)(error);
      return json({ error: "Conversion failed. Check the service log and Chrome installation." }, 500);
    } finally {
      active--;
    }
  };
}

const defaultHandler = createPlaygroundHandler();

/** Delegates API routes from a combined static+API dev server. */
export function handleRequest(request: Request): Promise<Response> {
  return defaultHandler(request);
}

async function readBoundedBody(request: Request, limit: number, timeoutMs: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (request.headers.has("content-length") && Number.isFinite(declared) && declared > limit) {
    throw new InputError(`Request body exceeds the ${limit} byte limit.`, 413);
  }
  if (!request.body) throw new InputError("Request body is empty.");
  const reader = request.body.getReader();
  let rejectTimeout!: (error: InputError) => void;
  const expired = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const cancel = (message: string) => {
    rejectTimeout(new InputError(message, 408));
    void reader.cancel().catch(() => {});
  };
  const timer = setTimeout(() => {
    cancel("Request body timed out.");
  }, timeoutMs);
  const onAbort = () => cancel("Request was cancelled.");
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) onAbort();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new InputError(`Request body exceeds the ${limit} byte limit.`, 413);
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
