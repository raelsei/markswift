import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversionResult } from "../../../src/index.ts";
import { macRenderMain, type RenderResult, renderAppMain } from "../../../tools/verify/native-template.ts";
import { buildRenderApp } from "../../../tools/verify/native.ts";

const result = (files: Record<string, string>, openArg?: string): RenderResult => ({
  ...({
    name: "V",
    files,
    assets: {},
    layout: { size: { w: 100, h: 50 }, canvas: "white", combo: { screen: "v", theme: "light" } },
  } as unknown as ConversionResult),
  ...(openArg ? { openArg } : {}),
});

test("render templates call the view with its open label set", () => {
  const results = [result({}), result({}, "isMoreExpanded")];
  for (const main of [renderAppMain(results), macRenderMain(results)])
    expect(main).toContain("    case 0: AnyView(V())\n    case 1: AnyView(V(isMoreExpanded: true))");
});

test("one render app takes identical files twice and refuses a differing duplicate", async () => {
  const work = await mkdtemp(join(tmpdir(), "markswift-render-app-"));
  try {
    const same = await buildRenderApp(
      [
        { result: result({ "V.swift": "struct V {}" }), output: join(work, "a.png") },
        { result: result({ "V.swift": "struct V {}" }, "isMoreExpanded"), output: join(work, "b.png") },
      ],
      join(work, "same"),
    ).catch((error: unknown) => error);
    // Past the duplicate check, swiftc rejects the stub view (or is absent): any error but the duplicate one.
    expect(String(same)).not.toContain("duplicate generated file");
    await expect(
      buildRenderApp(
        [
          { result: result({ "V.swift": "struct V {}" }), output: join(work, "a.png") },
          { result: result({ "V.swift": "struct V { }" }), output: join(work, "b.png") },
        ],
        join(work, "differ"),
      ),
    ).rejects.toThrow("duplicate generated file V.swift");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}, 120_000);
