import { expect, test } from "bun:test";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareCorpusImages } from "../../../tools/verify/corpus-metrics.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";

const layout: LayoutDoc = {
  version: 1, source: "metric-negative-control", combo: { screen: "metric", theme: "light", demoState: "normal" },
  size: { w: 100, h: 100 }, dpr: 1, canvas: "white", fonts: [],
  root: { tag: "main", attrs: { id: "region" }, styles: {}, bounds: { x: 0, y: 0, w: 100, h: 100 }, children: [] },
};
test("strict corpus evidence rejects a small moved feature and missing required regions", async () => {
  const work = await mkdtemp(join(tmpdir(), "markswift-metric-negative-"));
  try {
    const write = async (x: number, name: string) => {
      const data = Buffer.alloc(100 * 100 * 4, 255);
      for (let y = 5; y < 15; y++) for (let dx = 0; dx < 10; dx++) {
        const i = (y * 100 + x + dx) * 4; data[i] = data[i + 1] = data[i + 2] = 0;
      }
      const path = join(work, name);
      await sharp(data, { raw: { width: 100, height: 100, channels: 4 } }).png().toFile(path);
      return path;
    };
    const reference = await write(5, "reference.png"), moved = await write(70, "moved.png");
    const regions = [{ id: "region", label: "critical content" }];
    expect((await compareCorpusImages(reference, reference, layout, regions, 1)).failures).toEqual([]);
    const evidence = await compareCorpusImages(reference, moved, layout, regions, 1);
    expect(evidence.failures).toContain("critical content: missing or displaced edges");
    expect(evidence.failures).toContain("critical content: extra or displaced edges");
    expect((await compareCorpusImages(reference, reference, layout, [{ id: "missing", label: "required" }], 1)).failures).toContain("required: expected region missing from capture");
    expect((await compareCorpusImages(reference, reference, layout, [], 1)).failures).toContain("no declared critical regions");
  } finally { await rm(work, { recursive: true, force: true }); }
});
