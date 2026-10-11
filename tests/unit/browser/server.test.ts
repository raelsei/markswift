import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveDir } from "../../../src/input/server.ts";

test("static server refuses foreign hosts, dotfiles and malformed paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-server-"));
  const server = await serveDir(dir);
  try {
    await Bun.write(join(dir, "a.txt"), "a");
    await Bun.write(join(dir, ".env"), "SECRET=1");
    const status = async (path: string) => (await fetch(server.origin + path)).status;
    expect(await status("/a.txt")).toBe(200);
    expect(await status("/.env")).toBe(404);
    expect(await status("/.git/config")).toBe(404);
    expect(await status("/%E0%A4%A")).toBe(400);
    const port = Number(new URL(server.origin).port);
    const foreign = await new Promise<number>((done, fail) => {
      request({ host: "127.0.0.1", port, path: "/a.txt", headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        done(res.statusCode!);
      })
        .on("error", fail)
        .end();
    });
    expect(foreign).toBe(403);
  } finally {
    server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("static server sends Chrome's content types and no directories or escapes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "markswift-server-"));
  const server = await serveDir(dir);
  try {
    await Bun.write(join(dir, "a.js"), "export {}");
    await Bun.write(join(dir, "a.css"), "p{}");
    const res = (path: string) => fetch(server.origin + path);
    expect((await res("/a.js")).headers.get("content-type")).toContain("text/javascript");
    expect((await res("/a.css")).headers.get("content-type")).toContain("text/css");
    expect((await res("/%2e%2e/etc/passwd")).status).toBe(404);
    expect((await res("/")).status).toBe(404);
  } finally {
    server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
