import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStatic } from "../build.ts";
import { createPublicApp } from "../server/public-app.ts";
import { buildService } from "../build-service.ts";

test("static bundle works below a Pages project path and names its conversion API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-static-"));
  try {
    await buildStatic(directory, "https://api.example.com");
    const html = await Bun.file(join(directory, "index.html")).text();
    const config = await Bun.file(join(directory, "config.js")).text();
    expect(html).toContain('href="./styles.css"');
    expect(html).toContain('src="./app.js"');
    expect(config).toContain("https://api.example.com");
    expect(config).toContain('nativePreview:false');
    expect(await Bun.file(join(directory, "app.js")).exists()).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("public API allows one configured frontend origin and exposes conversion without native rendering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-public-api-"));
  try {
    const app = createPublicApp({ publicOrigin: "https://demo.example.com", workDirectory: directory });
    const allowed = { origin: "https://demo.example.com" };
    const capabilities = await app(new Request("https://api.example.com/api/capabilities", { headers: allowed }), "127.0.0.1");
    expect(capabilities.status).toBe(200);
    expect(await capabilities.json()).toEqual({ convert: true, nativePreview: false });
    expect(capabilities.headers.get("access-control-allow-origin")).toBe(allowed.origin);
    const preflight = await app(new Request("https://api.example.com/api/convert", { method: "OPTIONS", headers: { ...allowed, "access-control-request-method": "POST" } }), "127.0.0.1");
    expect(preflight.status).toBe(204);
    const denied = await app(new Request("https://api.example.com/api/convert", { method: "POST", headers: { origin: "https://other.example", "content-type": "application/json" }, body: "{}" }), "127.0.0.1");
    expect(denied.status).toBe(403);
    const native = await app(new Request("https://api.example.com/api/render", { method: "POST", headers: { ...allowed, "content-type": "application/json" }, body: "{}" }), "127.0.0.1");
    expect(native.status).toBe(404);
    const download = await app(new Request(`https://api.example.com/api/download/${crypto.randomUUID()}`), "127.0.0.1");
    expect(download.status).toBe(404);
    expect((await download.json()).error).toContain("expired");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("public API requires a secure frontend origin outside localhost", () => {
  expect(() => createPublicApp({ publicOrigin: "http://demo.example.com", workDirectory: "/tmp" })).toThrow("HTTPS");
});

test("conversion service bundles independently of the library source tree", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-service-"));
  try {
    await buildService(directory);
    const server = await Bun.file(join(directory, "server.js")).text();
    const manifest = await Bun.file(join(directory, "package.json")).json();
    expect(server).toContain('from "playwright-core"');
    expect(server).not.toContain('from "../../src/');
    expect(server).not.toMatch(/simctl|xcodebuild/);
    expect(manifest.dependencies["playwright-core"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(await Bun.file(join(directory, "convert-font.py")).exists()).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
