import { expect, test } from "bun:test";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";
import type { Browser } from "playwright-core";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const css =
  "html,body{margin:0} .card,.p-4,._card_ab12{box-sizing:border-box;width:240px;height:80px;padding:16px;background:rgb(255,0,0);font:16px system-ui}";
const GEORGIA = "/System/Library/Fonts/Supplemental/Georgia.ttf";

browserTest(
  "documents, fragments, compiled utility and module CSS use the same conversion",
  async () => {
    const sources = [
      { html: '<main data-markswift-root class="card">Hello</main>' },
      {
        html: '<!doctype html><html><head><title>Example</title></head><body><main data-markswift-root class="p-4">Hello</main></body></html>',
      },
      { html: '<main data-markswift-root class="_card_ab12">Hello</main>' },
    ];
    const results = await Promise.all(sources.map((source) => convert(source, { name: "CardView", css })));
    for (const result of results) {
      expect(result.layout.size).toEqual({ w: 240, h: 80 });
      expect(result.code).toContain("Hello");
      expect(result.warnings).toEqual([]);
    }
    expect(results[1]!.code).toBe(results[0]!.code);
    expect(results[2]!.code).toBe(results[0]!.code);
  },
  60000,
);

browserTest(
  "file and inline assetsDir inputs embed local image resources before server cleanup",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-api-test-"));
    try {
      await Bun.write(
        join(directory, "photo.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="red"/></svg>',
      );
      const photo = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      );
      await Bun.write(join(directory, "photo.png"), photo);
      await Bun.write(
        join(directory, "outside.png"),
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      await Bun.write(
        join(directory, "style.css"),
        "body{margin:0}main{width:100px;height:100px;background-image:url(photo.svg)}img{width:20px;height:20px}",
      );
      const html =
        '<link rel="stylesheet" href="style.css"><main data-markswift-root><img src="photo.svg"><img src="photo.png"><img src="photo.png"></main><img src="outside.png">';
      const file = join(directory, "card with spaces.html");
      await Bun.write(file, html);
      for (const source of [{ file }, { html, assetsDir: directory }]) {
        const result = await convert(source, { name: "LocalCard" });
        expect(result.layout.size).toEqual({ w: 100, h: 100 });
        expect(result.warnings).toEqual([]);
        expect(result.code).not.toContain("127.0.0.1");
        expect(JSON.stringify(result.layout)).toContain("data:image/svg+xml;base64,");
        expect(result.files["LocalCard+Shapes.swift"]).toContain("Shape");
        const images = Object.keys(result.assets).filter((k) => k.startsWith("Images/"));
        expect(images).toHaveLength(1);
        expect(result.assets[images[0]!]).toEqual(new Uint8Array(photo));
        expect(result.code).toContain("Image.markswiftAsset(");
        expect(result.code).not.toContain("iVBOR");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);

browserTest(
  "URL capture, preparation hook and explicit root work together",
  async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response('<div id="card" style="width:123px;height:45px">Before</div>', {
          headers: { "content-type": "text/html" },
        }),
    });
    try {
      const result = await convert(
        { url: `http://127.0.0.1:${server.port}/` },
        {
          root: "#card",
          prepare: async (page) => {
            await page.locator("#card").evaluate((el) => {
              el.textContent = "After";
            });
          },
        },
      );
      expect(result.layout.size).toEqual({ w: 123, h: 45 });
      expect(result.code).toContain("After");
    } finally {
      server.stop(true);
    }
  },
  30000,
);

browserTest(
  "resource failures are returned to the caller",
  async () => {
    const result = await convertHtml(
      '<main data-markswift-root style="width:100px;height:50px"><img src="/missing.png" width="20" height="20" alt="Missing"></main>',
    );
    expect(result.warnings.some((message) => message.includes("missing.png"))).toBe(true);
  },
  30000,
);

browserTest(
  "faces without an explicit font-weight are reported as loaded",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-font-test-"));
    try {
      await copyFile(GEORGIA, join(directory, "face.ttf"));
      const file = join(directory, "page.html");
      await Bun.write(
        file,
        '<style>@font-face{font-family:"MyFace";src:url(face.ttf)}@font-face{font-family:"MyFace";font-weight:bold;src:url(face.ttf)}main{font-family:MyFace}</style><main data-markswift-root style="width:200px;height:40px">Hello <b>bold</b></main>',
      );
      const result = await convert({ file });
      expect(result.layout.fonts).toHaveLength(2);
      expect(result.layout.fonts.every((f) => f.loaded)).toBe(true);
      expect(result.warnings.filter((w) => w.includes("never loaded"))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);

browserTest(
  "faces declared in @imported sheets are collected",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-import-test-"));
    try {
      await copyFile(GEORGIA, join(directory, "face.ttf"));
      await Bun.write(join(directory, "fonts.css"), '@font-face{font-family:"Imported";src:url(face.ttf)}');
      await Bun.write(join(directory, "main.css"), '@import "fonts.css"; main{font-family:Imported}');
      const file = join(directory, "page.html");
      await Bun.write(
        file,
        '<link rel="stylesheet" href="main.css"><main data-markswift-root style="width:200px;height:40px">Hello</main>',
      );
      const result = await convert({ file });
      expect(result.layout.fonts.find((f) => f.family === "Imported")?.loaded).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);

browserTest(
  "faces declared in cross-origin sheets are collected",
  async () => {
    const georgia = Bun.file(GEORGIA);
    const cors = { "access-control-allow-origin": "*" };
    const remote = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname === "/fonts.css"
          ? new Response('@font-face{font-family:"Remote";src:url(/remote.ttf)}', {
              headers: { ...cors, "content-type": "text/css" },
            })
          : new Response(georgia, { headers: { ...cors, "content-type": "font/ttf" } }),
    });
    // A served page, not a `{ file }` source: Chrome's Local Network Access blocks loopback
    // subresources of a route-fulfilled document, which a public CDN sheet never meets.
    const page = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(
          `<link rel="stylesheet" href="http://127.0.0.1:${remote.port}/fonts.css"><main data-markswift-root style="width:200px;height:40px;font-family:Remote">Hello</main>`,
          { headers: { "content-type": "text/html" } },
        ),
    });
    try {
      const result = await convert({ url: `http://127.0.0.1:${page.port}/` });
      expect(result.warnings.filter((w) => w.includes("could not be read"))).toEqual([]);
      expect(result.layout.fonts.find((f) => f.family === "Remote")?.loaded).toBe(true);
    } finally {
      page.stop(true);
      remote.stop(true);
    }
  },
  60000,
);

browserTest(
  "uncompiled Tailwind directives are reported",
  async () => {
    const result = await convertHtml('<main data-markswift-root style="width:10px;height:10px"></main>', {
      css: "@tailwind base;\n@tailwind utilities;",
    });
    expect(result.warnings.filter((w) => w.includes("uncompiled Tailwind"))).toHaveLength(1);
  },
  30000,
);

browserTest(
  "redirected, mistyped and lazy images are embedded",
  async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        switch (new URL(req.url).pathname) {
          case "/old.png":
            return new Response(null, { status: 302, headers: { location: "/new.png" } });
          case "/new.png":
          case "/lazy.png":
            return new Response(png, { headers: { "content-type": "image/png" } });
          case "/typed.bin":
            return new Response(png, { headers: { "content-type": "application/octet-stream" } });
          default:
            return new Response(
              '<main data-markswift-root style="width:100px"><img src="/old.png" width=10 height=10><img src="/typed.bin" width=10 height=10><img loading="lazy" src="/lazy.png" width=10 height=10 style="margin-top:3000px"></main>',
              { headers: { "content-type": "text/html" } },
            );
        }
      },
    });
    try {
      const result = await convert({ url: `http://127.0.0.1:${server.port}/` });
      expect(result.warnings.filter((w) => w.includes("Image could not be embedded"))).toEqual([]);
      expect(JSON.stringify(result.layout).match(/data:image\/png/g)).toHaveLength(3);
    } finally {
      server.stop(true);
    }
  },
  60000,
);

browserTest(
  "restricted pasted HTML cannot run scripts or request server-side resources",
  async () => {
    // Raw TCP: connections that never send an HTTP request (preconnect) are counted too.
    let connects = 0;
    const listener = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        open() {
          connects++;
        },
        data() {},
      },
    });
    try {
      const remote = `http://127.0.0.1:${listener.port}`;
      const html =
        `<style>@import url(${remote}/import.css);@font-face{font-family:Probe;src:url(${remote}/font.woff2)}main{font-family:Probe}</style>` +
        `<link rel=stylesheet href=${remote}/link.css><link rel=preconnect href=${remote}><link rel=dns-prefetch href=${remote}><link rel=prefetch href=${remote}/prefetch>` +
        `<meta http-equiv=refresh content="0;url=${remote}/refresh">` +
        `<main data-markswift-root style="width:180px;height:80px">Original<img src="${remote}/pixel.png"><img src="file:///etc/hosts">` +
        `<iframe src=${remote}/frame></iframe><svg width=10 height=10><image href=${remote}/svg.png width=10 height=10 /></svg><a href=${remote}/anchor>link</a></main>` +
        `<script>document.querySelector("main").textContent="Executed";fetch("${remote}/script")</script>`;
      const result = await convertHtml(html, { name: "RestrictedView", untrustedInput: true });
      await Bun.sleep(300); // a connect that never happens has no event to await; give late ones a window
      expect(result.code).toContain("Original");
      expect(result.code).not.toContain("Executed");
      expect(connects).toBe(0);
      const embedded: string[] = [];
      const visit = (n: LayoutNode) => {
        if (n.tag === "img" && n.currentSrc?.startsWith("data:")) embedded.push(n.currentSrc);
        n.children.forEach(visit);
      };
      visit(result.layout.root);
      expect(embedded).toEqual([]);
    } finally {
      listener.stop(true);
    }
  },
  30000,
);

browserTest(
  "a failed preparation closes the browser and local asset server",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-cleanup-test-"));
    let origin = "";
    const handles: { browser?: Browser | null } = {};
    try {
      await expect(
        convert(
          { html: "<main>Failure case</main>", assetsDir: directory },
          {
            async prepare(page) {
              origin = new URL(page.url()).origin;
              handles.browser = page.context().browser();
              throw new Error("intentional preparation failure");
            },
          },
        ),
      ).rejects.toThrow("intentional preparation failure");
      expect(handles.browser).toBeDefined();
      expect(handles.browser!.isConnected()).toBe(false);
      await expect(fetch(origin)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);

browserTest(
  "a stalled page fails as timed out",
  async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname === "/stall.png"
          ? new Promise<Response>(() => {})
          : new Response('<main data-markswift-root style="width:10px;height:10px"><img src="/stall.png"></main>', {
              headers: { "content-type": "text/html" },
            }),
    });
    try {
      const started = performance.now();
      // ponytail: plain await, not `expect(p).rejects` — Bun 1.4.3 never fires the test timeout while
      // `.rejects` awaits a promise that never settles, so a regression here would hang the suite, not fail it.
      const error = await convert({ url: `http://127.0.0.1:${server.port}/` }, { timeoutMs: 2000 }).catch((e) => e);
      expect(String(error)).toMatch(/timed out after 2000 ms/);
      expect(performance.now() - started).toBeLessThan(10_000);
    } finally {
      server.stop(true);
    }
  },
  15000,
);

browserTest(
  "the deadline also ends a capture step that closing Chrome cannot reject",
  async () => {
    // A never-settling prepare hook stands in for Playwright's `newPage` in flight as the context closes.
    const error = await convertHtml('<main data-markswift-root style="width:10px;height:10px"></main>', {
      timeoutMs: 2000,
      prepare: () => new Promise<void>(() => {}),
    }).catch((e) => e); // not `.rejects`: see the stalled-page test above
    expect(String(error)).toMatch(/timed out after 2000 ms/);
  },
  15000,
);

test("invalid API options fail before browser startup", async () => {
  await expect(convertHtml("<div/>", { name: "Text" })).rejects.toThrow();
  await expect(convertHtml("<div/>", { viewport: { width: 0, height: 100 } })).rejects.toThrow();
  await expect(convert({ url: "file:///private/file.html" })).rejects.toThrow("http");
  await expect(convert({ url: "https://example.com" }, { untrustedInput: true })).rejects.toThrow("pasted HTML");
  await expect(convert({ html: "<main>Hi</main>", assetsDir: "." }, { untrustedInput: true })).rejects.toThrow(
    "assetsDir",
  );
  await expect(convertHtml("<div/>", { timeoutMs: 0 })).rejects.toThrow("timeoutMs");
});
