import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversionResult } from "../../src/index.ts";
import { allowRequest, conversionInput } from "../server/request.ts";
import { SerialQueue } from "../server/queue.ts";
import { createApp } from "../server/app.ts";
import { ResultStore, sweepResults } from "../server/store.ts";

const input = { html: "<p>Hello</p>", name: "CardView", width: 390, height: 520, theme: "light", mode: "app" };
test("input limits reject invalid dimensions, modes and excessive markup", () => {
  expect(conversionInput.parse(input).css).toBe("");
  for (const extra of [{ width: -1 }, { height: 2001 }, { mode: "unknown" }, { name: "x\n{}" }, { html: "x".repeat(500001) }]) {
    expect(conversionInput.safeParse({ ...input, ...extra }).success).toBe(false);
  }
});
test("loopback API refuses cross-site and opaque preview frame requests", () => {
  const request = (headers: Record<string, string>) => new Request("http://127.0.0.1:4317/api/convert", { method: "POST", headers, body: "{}" });
  expect(allowRequest(request({ "content-type": "application/json", origin: "http://127.0.0.1:4317" }), 4317)).toBe(true);
  for (const origin of ["null", "https://example.com", "http://localhost:4317"]) {
    expect(allowRequest(request({ "content-type": "application/json", origin }), 4317)).toBe(false);
  }
  expect(allowRequest(request({ "content-type": "text/plain" }), 4317)).toBe(false);
  expect(allowRequest(new Request("http://example.com:4317/"), 4317)).toBe(false);
});
test("native queue serializes jobs and continues after failure", async () => {
  const queue = new SerialQueue();
  const events: string[] = [];
  const first = queue.run(async () => { events.push("a-start"); await Bun.sleep(10); events.push("a-end"); throw Error("expected"); });
  const second = queue.run(async () => { events.push("b"); return 42; });
  await expect(first).rejects.toThrow("expected");
  expect(await second).toBe(42);
  expect(events).toEqual(["a-start", "a-end", "b"]);
});
test("HTTP failures are structured and do not launch capture", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-http-test-"));
  try {
    const app = createApp(4317, directory, false);
    const response = await app(new Request("http://127.0.0.1:4317/api/convert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, width: 0 }) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("width");
    const absent = await app(new Request(`http://127.0.0.1:4317/api/jobs/${crypto.randomUUID()}`));
    expect(absent.status).toBe(404);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const result = (assets: Record<string, Uint8Array> = {}) =>
  ({ name: "CardView", code: "", files: { "CardView.swift": "struct CardView {}" }, assets, diagnostics: [], warnings: [], layout: {} }) as unknown as ConversionResult;

test("download refuses unsafe bundle paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-store-"));
  try {
    const store = new ResultStore(directory);
    const id = await store.add(result({ "../evil.txt": new Uint8Array([1]) }));
    await expect(store.download(id)).rejects.toThrow(/Unsafe output path/);
    expect(await Bun.file(join(directory, "evil.txt")).exists()).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("download builds the ZIP once and shares it between concurrent requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-store-"));
  try {
    const store = new ResultStore(directory);
    const id = await store.add(result());
    const [a, b] = await Promise.all([store.download(id), store.download(id)]);
    expect(a.file.name).toBe(b.file.name!);
    const before = (await stat(a.file.name!)).mtimeMs;
    const c = await store.download(id);
    expect(c.file.name).toBe(a.file.name!);
    expect((await stat(c.file.name!)).mtimeMs).toBe(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("sweepResults removes only result directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-sweep-"));
  try {
    for (const name of [crypto.randomUUID(), "native", "checks"]) await mkdir(join(directory, name));
    await sweepResults(directory);
    expect((await readdir(directory)).sort()).toEqual(["checks", "native"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
