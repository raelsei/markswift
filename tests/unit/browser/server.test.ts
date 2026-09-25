import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveDir } from "../../../src/browser/server.ts";

test("local capture server serves pages, assets and mounts, then closes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-static-server-"));
  const root = join(directory, "root");
  const vendor = join(directory, "vendor");
  await Bun.write(join(root, "page.html"), '<link rel="stylesheet" href="style.css"><main>Local</main>');
  await Bun.write(join(root, "style.css"), "main{color:red}");
  await Bun.write(join(vendor, "app.js"), "export const value = 1;");
  await Bun.write(join(directory, "secret.txt"), "outside root");
  const server = await serveDir(root);
  try {
    const page = await fetch(`${server.origin}/page.html`);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("Local");
    const css = await fetch(`${server.origin}/style.css`);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toBe("main{color:red}");
    const mounted = await fetch(server.mount("/__h2s/vendor", vendor) + "/app.js");
    expect(await mounted.text()).toBe("export const value = 1;");
    const memory = await fetch(server.addPage("fragment", "<p>Memory</p>"));
    expect(await memory.text()).toBe("<p>Memory</p>");
    expect((await fetch(`${server.origin}/missing.png`)).status).toBe(404);
    expect((await fetch(`${server.origin}/..%2Fsecret.txt`)).status).toBe(403);
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
  await expect(fetch(`${server.origin}/page.html`)).rejects.toThrow();
});
