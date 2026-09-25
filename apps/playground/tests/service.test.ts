import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlaygroundHandler, HTTP_IDLE_TIMEOUT_SECONDS } from "../service/app.ts";
import { convertIsolated, WorkerError } from "../service/isolated.ts";

const url = "http://localhost:8787";
const request = (body: unknown, path = "/api/convert", headers: Record<string, string> = {}) => new Request(url + path, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const fixtureResult = {
  name: "CardView",
  files: { "CardView.swift": "struct CardView: View {}" },
  mapping: { total: 1, mapped: 1, approximated: 0, unmapped: 0 },
  diagnostics: [],
  warnings: [],
  assets: { "Fonts/Example.ttf": Uint8Array.from([0, 1, 255]) },
};

test("health and unknown routes are JSON without starting Chrome", async () => {
  const handler = createPlaygroundHandler({ convert: async () => { throw new Error("unexpected"); } });
  const health = await handler(new Request(url + "/health"));
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  const missing = await handler(new Request(url + "/missing"));
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: "Not found." });
});

test("conversion uses the public input contract and serializes assets", async () => {
  let seen: unknown;
  const handler = createPlaygroundHandler({
    convert: async (source, options) => { seen = { source, options }; return fixtureResult; },
  });
  const response = await handler(request({ html: "<main>Hello</main>", css: "main{color:red}", name: "CardView", mode: "fidelity", viewport: { width: 393, height: 852 }, theme: "dark" }));
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual({
    name: "CardView", files: fixtureResult.files, mapping: fixtureResult.mapping,
    diagnostics: [], warnings: [], assets: { "Fonts/Example.ttf": "AAH/" },
  });
  expect(seen).toEqual({ source: { html: "<main>Hello</main>" }, options: {
    css: "main{color:red}", name: "CardView", mode: "fidelity", viewport: { width: 393, height: 852 }, theme: "dark", untrustedInput: true,
  } });
});

test("rejects unknown input capabilities and malformed options", async () => {
  const handler = createPlaygroundHandler({ convert: async () => fixtureResult });
  for (const body of [
    { url: "https://example.com" },
    { file: "/etc/passwd", html: "<main/>" },
    { html: "<main/>", baseURL: "https://example.com" },
    { html: "" },
    { html: "<main/>", name: "badName" },
    { html: "<main/>", mode: "website" },
    { html: "<main/>", theme: "auto" },
    { html: "<main/>", viewport: { width: 0, height: 844 } },
  ]) {
    const response = await handler(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeString();
  }
  const wrongType = await handler(new Request(url + "/api/convert", { method: "POST", body: "html=hello", headers: { "Content-Type": "text/plain" } }));
  expect(wrongType.status).toBe(400);
  expect((await wrongType.json()).error).toContain("application/json");
  const invalidJson = await handler(new Request(url + "/api/convert", { method: "POST", body: "{", headers: { "Content-Type": "application/json" } }));
  expect(invalidJson.status).toBe(400);
});

test("request body is bounded before JSON parsing", async () => {
  const handler = createPlaygroundHandler({ maxBodyBytes: 40, convert: async () => fixtureResult });
  const response = await handler(request({ html: "x".repeat(100) }));
  expect(response.status).toBe(413);
  expect((await response.json()).error).toContain("exceeds");
});

test("same-origin by default; configured origin gets exact CORS access", async () => {
  const defaultHandler = createPlaygroundHandler({ convert: async () => fixtureResult });
  const blocked = await defaultHandler(request({ html: "<main/>" }, "/api/convert", { Origin: "https://evil.example" }));
  expect(blocked.status).toBe(403);
  expect(blocked.headers.get("access-control-allow-origin")).toBeNull();

  const handler = createPlaygroundHandler({ allowedOrigin: "https://playground.example", convert: async () => fixtureResult });
  const preflight = await handler(new Request(url + "/api/convert", {
    method: "OPTIONS", headers: { Origin: "https://playground.example", "Access-Control-Request-Method": "POST" },
  }));
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe("https://playground.example");
  const allowed = await handler(request({ html: "<main/>" }, "/api/convert", { Origin: "https://playground.example" }));
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("access-control-allow-origin")).toBe("https://playground.example");
  expect(() => createPlaygroundHandler({ allowedOrigin: "https://playground.example/path" })).toThrow();
});

test("concurrent captures are limited and release slots after errors", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const handler = createPlaygroundHandler({ maxConcurrent: 1, logError: () => {}, convert: async () => {
    if (++calls === 1) { entered(); await pending; throw new Error("Chrome failed"); }
    return fixtureResult;
  } });
  const first = handler(request({ html: "<main/>" }));
  await started;
  const busy = await handler(request({ html: "<main/>" }));
  expect(busy.status).toBe(429);
  expect(busy.headers.get("retry-after")).toBe("2");
  release();
  const failed = await first;
  expect(failed.status).toBe(500);
  expect((await failed.json()).error).toContain("Conversion failed");
  const next = await handler(request({ html: "<main/>" }));
  expect(next.status).toBe(200);
});

test("HTTP connection stays open beyond Bun's 10-second default during conversion", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: HTTP_IDLE_TIMEOUT_SECONDS,
    fetch: createPlaygroundHandler({ convert: async () => {
      await Bun.sleep(10_500);
      return fixtureResult;
    } }),
  });
  try {
    const response = await fetch(new URL("/api/convert", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<main>Long conversion</main>" }),
      signal: AbortSignal.timeout(15_000),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).files).toEqual(fixtureResult.files);
  } finally {
    server.stop(true);
  }
}, 16_000);

test("slow request occupies a slot before its body is read, then times out", async () => {
  const handler = createPlaygroundHandler({ maxConcurrent: 1, bodyTimeoutMs: 40, convert: async () => fixtureResult });
  const slow = new Request(url + "/api/convert", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: new ReadableStream<Uint8Array>({ start() {} }),
  });
  const pending = handler(slow);
  const busy = await handler(request({ html: "<main/>" }));
  expect(busy.status).toBe(429);
  const timedOut = await pending;
  expect(timedOut.status).toBe(408);
  expect((await timedOut.json()).error).toContain("timed out");
  expect((await handler(request({ html: "<main/>" }))).status).toBe(200);
});

test("cancelled slow request releases its admission slot", async () => {
  const controller = new AbortController();
  const handler = createPlaygroundHandler({ maxConcurrent: 1, bodyTimeoutMs: 5_000, convert: async () => fixtureResult });
  const slow = new Request(url + "/api/convert", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
    body: new ReadableStream<Uint8Array>({ start() {} }),
  });
  const pending = handler(slow);
  controller.abort();
  expect((await pending).status).toBe(408);
  expect((await handler(request({ html: "<main/>" }))).status).toBe(200);
});

test("isolated worker is killed at its hard deadline", async () => {
  let pid = 0;
  const run = convertIsolated({ html: "<main/>" }, {
    timeoutMs: 80,
    command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    onSpawn: value => { pid = value; },
  });
  try {
    await run;
    throw new Error("worker unexpectedly completed");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkerError);
    expect((error as WorkerError).status).toBe(504);
  }
  expect(pid).toBeGreaterThan(0);
  expect(() => process.kill(pid, 0)).toThrow();
});

test("abort signal cancels the isolated worker and bounds its output", async () => {
  const controller = new AbortController();
  let pid = 0;
  const run = convertIsolated({ html: "<main/>" }, {
    timeoutMs: 5_000, signal: controller.signal,
    command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    onSpawn: value => { pid = value; },
  });
  controller.abort();
  try { await run; throw new Error("worker unexpectedly completed"); }
  catch (error) {
    expect(error).toBeInstanceOf(WorkerError);
    expect((error as WorkerError).status).toBe(408);
  }
  expect(() => process.kill(pid, 0)).toThrow();
  await expect(convertIsolated({ html: "<main/>" }, {
    timeoutMs: 2_000, maxOutputBytes: 16,
    command: [process.execPath, "-e", "process.stdout.write('x'.repeat(1000))"],
  })).rejects.toThrow("output exceeds");
});

test("reserved Swift names remain client errors in the isolated path", async () => {
  const response = await createPlaygroundHandler()(
    request({ html: "<main>Hi</main>", name: "Text" }),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("Swift type identifier");
});

test("worker deadline kills its descendant process group", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-service-tree-"));
  const pidFile = join(directory, "child.pid");
  const marker = join(directory, "child-survived");
  const childCode = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "survived"), 700); setInterval(() => {}, 1000)`;
  const workerCode = `const {spawn}=require("node:child_process"); const fs=require("node:fs");`
    + `const child=spawn(process.execPath,["-e",${JSON.stringify(childCode)}],{stdio:"ignore",detached:true});`
    + `fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid)); setInterval(() => {}, 1000)`;
  let childPid = 0;
  try {
    const running = convertIsolated({ html: "<main/>" }, {
      timeoutMs: 500, command: [process.execPath, "-e", workerCode],
    });
    for (let attempt = 0; attempt < 40 && !existsSync(pidFile); attempt++) await Bun.sleep(10);
    expect(existsSync(pidFile)).toBe(true);
    childPid = Number(await readFile(pidFile, "utf-8"));
    await expect(running).rejects.toMatchObject({ status: 504 });
    await Bun.sleep(350);
    expect(existsSync(marker)).toBe(false);
  } finally {
    if (childPid > 0) {
      try { process.kill(childPid, "SIGKILL"); } catch { /* Already stopped with its process group. */ }
    }
    await rm(directory, { recursive: true, force: true });
  }
});

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("real Chrome conversion returns Swift files without exposing capture layout", async () => {
  const handler = createPlaygroundHandler();
  const response = await handler(request({
    html: '<main data-markswift-root style="width:180px;height:80px;background:#123456;color:white">Hello</main>',
    name: "HelloView",
  }));
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.name).toBe("HelloView");
  expect(payload.files["HelloView.swift"]).toContain("Hello");
  expect(payload.mapping.total).toBeGreaterThan(0);
  expect(payload.layout).toBeUndefined();
}, 30000);
