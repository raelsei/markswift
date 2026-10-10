import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatDiagnostics, writeBundle } from "../../../src/cli/output.ts";

test("bundle writing rejects names that collide on case-insensitive filesystems", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-output-"));
  try {
    const output = join(directory, "generated");
    await expect(
      writeBundle({ files: { "Card.swift": "one", "card.swift": "two" }, assets: {} }, output),
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
    await expect(writeBundle({ files: { "../escaped.swift": "bad" }, assets: {} }, output)).rejects.toThrow(
      "Unsafe output path",
    );
    expect(await Bun.file(join(directory, "escaped.swift")).exists()).toBe(false);
    expect(await Bun.file(join(output, "Card.swift")).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
