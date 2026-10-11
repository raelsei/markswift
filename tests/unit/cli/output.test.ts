import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EditedFilesError } from "../../../src/cli/manifest.ts";
import { formatDiagnostics, formatWarning, updateBundle, writeBundle } from "../../../src/cli/output.ts";

test("bundle writing rejects names that collide on case-insensitive filesystems", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-output-"));
  try {
    const output = join(directory, "generated");
    await expect(
      writeBundle({ files: { "Card.swift": "one", "card.swift": "two" }, assets: {} }, output, { version: "test" }),
    ).rejects.toThrow("Duplicate output path");
    expect(await Bun.file(join(output, "Card.swift")).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("bundle writing preserves nested binary assets beside Swift sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-output-assets-"));
  try {
    const output = join(directory, "generated");
    const bytes = new Uint8Array([0, 255, 17, 42]);
    const written = await writeBundle(
      { files: { "Card.swift": "struct Card {}" }, assets: { "Fonts/Example.ttf": bytes } },
      output,
      { version: "test" },
    );
    expect(written).toEqual(["Card.swift", "Fonts/Example.ttf"]);
    expect(await Bun.file(join(output, "Card.swift")).text()).toBe("struct Card {}");
    expect(new Uint8Array(await Bun.file(join(output, "Fonts/Example.ttf")).arrayBuffer())).toEqual(bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("bundle writing rejects traversal before creating an output directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-output-traversal-"));
  try {
    const output = join(directory, "generated");
    await expect(
      writeBundle({ files: { "../escaped.swift": "bad" }, assets: {} }, output, { version: "test" }),
    ).rejects.toThrow("Unsafe output path");
    expect(await Bun.file(join(directory, "escaped.swift")).exists()).toBe(false);
    expect(await Bun.file(join(output, "Card.swift")).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const version = { version: "test" };
const sha = (contents: string | Uint8Array) => createHash("sha256").update(contents).digest("hex");
const bundle = (view: string, extra: Record<string, string> = {}) => ({
  files: { "Card.swift": view, "MarkswiftRuntime.swift": "rt", ...extra },
  assets: { "Images/a.png": new Uint8Array([1, 2]) } as Record<string, Uint8Array>,
});

/** Every file (hex bytes) and directory (`dir/` → "") below `dir`, dotfiles included. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const entries: Array<[string, string]> = [];
  for (const name of await readdir(dir, { recursive: true })) {
    const path = join(dir, name);
    entries.push((await lstat(path)).isDirectory() ? [`${name}/`, ""] : [name, (await readFile(path)).toString("hex")]);
  }
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
}

async function inTemp(body: (output: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "markswift-update-"));
  try {
    await body(join(directory, "generated"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("writeBundle records every written file's SHA-256 in .markswift.json", () =>
  inTemp(async (output) => {
    const written = await writeBundle(bundle("view"), output, version);
    expect(written).toEqual(["Card.swift", "Images/a.png", "MarkswiftRuntime.swift"]);
    const text = await readFile(join(output, ".markswift.json"), "utf8");
    const files = {
      "Card.swift": sha("view"),
      "Images/a.png": sha(new Uint8Array([1, 2])),
      "MarkswiftRuntime.swift": sha("rt"),
    };
    expect(text).toBe(`${JSON.stringify({ tool: "markswift", version: "test", files }, null, 2)}\n`);
  }));

test("updateBundle with an unchanged bundle leaves every byte as it was", () =>
  inTemp(async (output) => {
    await updateBundle(bundle("view"), output, version);
    const before = await snapshot(output);
    expect(await updateBundle(bundle("view"), output, version)).toEqual([
      "Card.swift",
      "Images/a.png",
      "MarkswiftRuntime.swift",
    ]);
    expect(await snapshot(output)).toEqual(before);
  }));

test("updateBundle refuses a hand-edited file before writing anything", () =>
  inTemp(async (output) => {
    await writeBundle(bundle("view"), output, version);
    await writeFile(join(output, "Card.swift"), "view\n// mine");
    const before = await snapshot(output);
    const error = await updateBundle(bundle("view 2"), output, version).catch((e) => e);
    expect(error).toBeInstanceOf(EditedFilesError);
    expect(error.files).toEqual(["Card.swift"]);
    expect(error.message).toContain("--force");
    expect(await snapshot(output)).toEqual(before);
  }));

test("updateBundle --force discards hand edits", () =>
  inTemp(async (output) => {
    await writeBundle(bundle("view"), output, version);
    await writeFile(join(output, "Card.swift"), "view\n// mine");
    await updateBundle(bundle("view 2"), output, { ...version, force: true });
    expect(await readFile(join(output, "Card.swift"), "utf8")).toBe("view 2");
    const manifest = JSON.parse(await readFile(join(output, ".markswift.json"), "utf8"));
    expect(manifest.files["Card.swift"]).toBe(sha("view 2"));
  }));

test("updateBundle never touches files it did not write", () =>
  inTemp(async (output) => {
    await writeBundle(bundle("view"), output, version);
    await writeFile(join(output, "Wrapper.swift"), "struct Wrapper {}");
    await updateBundle(bundle("view 2"), output, version);
    expect(await readFile(join(output, "Wrapper.swift"), "utf8")).toBe("struct Wrapper {}");
    const manifest = JSON.parse(await readFile(join(output, ".markswift.json"), "utf8"));
    expect(Object.keys(manifest.files)).not.toContain("Wrapper.swift");
  }));

test("updateBundle refuses an unlisted file at a generated path, even with --force", () =>
  inTemp(async (output) => {
    await writeBundle(bundle("view"), output, version);
    await writeFile(join(output, "Card+Shapes.swift"), "mine");
    const before = await snapshot(output);
    for (const force of [false, true]) {
      const error = await updateBundle(bundle("view", { "Card+Shapes.swift": "shapes" }), output, {
        ...version,
        force,
      }).catch((e) => e);
      expect(error).toBeInstanceOf(EditedFilesError);
      expect(error.files).toEqual(["Card+Shapes.swift"]);
      expect(await snapshot(output)).toEqual(before);
    }
  }));

test("updateBundle deletes listed files the new bundle no longer produces and prunes their empty folders", () =>
  inTemp(async (output) => {
    const without = { files: bundle("view").files, assets: {} };
    await writeBundle(bundle("view", { "Card+Shapes.swift": "shapes" }), output, version);
    await updateBundle(without, output, version);
    expect(Object.keys(await snapshot(output))).toEqual([".markswift.json", "Card.swift", "MarkswiftRuntime.swift"]);

    await rm(output, { recursive: true });
    await writeBundle(bundle("view", { "Card+Shapes.swift": "shapes" }), output, version);
    await writeFile(join(output, "Images/mine.png"), "mine");
    await updateBundle(without, output, version);
    expect(Object.keys(await snapshot(output))).toEqual([
      ".markswift.json",
      "Card.swift",
      "Images/",
      "Images/mine.png",
      "MarkswiftRuntime.swift",
    ]);
  }));

test("updateBundle refuses a directory without a manifest", () =>
  inTemp(async (output) => {
    await mkdir(output);
    await writeFile(join(output, "keep.txt"), "keep me");
    const error = await updateBundle(bundle("view"), output, version).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(EditedFilesError);
    expect(error.message).toContain("has no .markswift.json");
    expect(await snapshot(output)).toEqual({ "keep.txt": Buffer.from("keep me").toString("hex") });
  }));

test("updateBundle into a missing directory writes the same as writeBundle", () =>
  inTemp(async (output) => {
    const fresh = `${output}-fresh`;
    expect(await updateBundle(bundle("view"), output, version)).toEqual(
      await writeBundle(bundle("view"), fresh, version),
    );
    expect(await snapshot(output)).toEqual(await snapshot(fresh));
  }));

test("updateBundle recreates a listed file the developer deleted", () =>
  inTemp(async (output) => {
    await writeBundle(bundle("view"), output, version);
    await unlink(join(output, "Card.swift"));
    await updateBundle(bundle("view 2"), output, version);
    expect(await readFile(join(output, "Card.swift"), "utf8")).toBe("view 2");
  }));

test("updateBundle rejects a manifest written by another tool", () =>
  inTemp(async (output) => {
    await mkdir(output);
    await writeFile(join(output, ".markswift.json"), '{"tool":"other"}');
    await expect(updateBundle(bundle("view"), output, version)).rejects.toThrow("is not a Markswift manifest");
  }));

test("diagnostics print once per feature and message, unmapped first, naming the nodes", () => {
  const float = { level: "approximated" as const, feature: "float", message: "m" };
  expect(
    formatDiagnostics([
      { id: "#a", kind: "stack", confidence: "approximated", diagnostics: [float] },
      { id: "#b", kind: "stack", confidence: "approximated", diagnostics: [{ ...float }] },
      {
        id: "#c",
        kind: "svg",
        confidence: "unmapped",
        diagnostics: [{ level: "unmapped", feature: "svg:use", message: "u" }],
      },
    ]),
  ).toEqual(["unmapped svg:use: u [1 node: #c]", "approximated float: m [2 nodes: #a, #b]"]);
});

test("warnings print the component and loss prefixes only when set", () => {
  expect(formatWarning({ source: "fonts", level: "unmapped", feature: "font-family", message: "x" })).toBe(
    "unmapped font-family: x",
  );
  expect(formatWarning({ source: "capture", message: "404 /a.png" })).toBe("404 /a.png");
  expect(
    formatWarning({ source: "build", component: "Card", level: "approximated", feature: "font-family", message: "y" }),
  ).toBe("[Card] approximated font-family: y");
});
