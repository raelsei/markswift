import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { FontFace } from "../../../src/model/layout.ts";
import { readFontBytes } from "../../../src/browser/fonts.ts";
import { packageFonts } from "../../../src/fonts/package.ts";
import { srcBytes } from "../../../src/fonts/source.ts";

test("font capture uses stable content hashes and portable file reads", async () => {
  const bytes = Buffer.from("wOF2same-font-content");
  const server = createServer((_request, response) => response.writeHead(200).end(bytes));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/font.woff2`;
    const faces: FontFace[] = [{ family: "Demo", weight: [400, 400], style: "normal", loaded: true,
      src: [{ url }, { url }] }];
    const captured = await readFontBytes(faces);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    expect(captured).toEqual([{ name: `${hash}.woff2`, bytes: new Uint8Array(bytes) }]);
    expect(faces[0]!.src.map((source) => source.file)).toEqual([`_fonts/${hash}.woff2`, `_fonts/${hash}.woff2`]);
    expect(faces[0]!.src.map((source) => source.url)).toEqual(["/font.woff2", "/font.woff2"]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test("unconvertible captured font is reported and its original bytes remain available", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-font-files-"));
  try {
    const bytes = Buffer.from("wOF2invalid-font");
    await mkdir(join(directory, "_fonts"));
    await writeFile(join(directory, "_fonts", "demo.woff2"), bytes);
    const source = { url: "https://example.invalid/demo.woff2", file: "_fonts/demo.woff2" };
    expect(await srcBytes(source, directory)).toEqual(new Uint8Array(bytes));
    expect(await srcBytes({ url: source.url, file: "_fonts/missing.woff2" }, directory)).toBeUndefined();

    const output = join(directory, "output");
    const result = await packageFonts([{ family: "Demo", weight: [400, 400], style: "normal", loaded: true, src: [source] }], output, directory);
    expect(result.faces).toEqual([]);
    expect(result.notes.some((note) => note.includes("WOFF2") && note.includes("could not be packaged"))).toBe(true);
    expect(await readFile(join(output, "Fonts", "Demo.ttf"))).toEqual(bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
