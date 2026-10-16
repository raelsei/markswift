import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import type { Layer } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const fixture = (name: string) => Bun.file(`${import.meta.dir}/../conformance/fixtures/components/${name}.html`).text();

browserTest(
  "dialog: content and scrim enter on light and dark, exit read on light and copied to dark",
  async () => {
    const result = await convertHtml(await fixture("overlay-dialog"), { name: "Overlay", theme: "adaptive" });
    for (const layers of [result.layout.layers, result.darkLayout?.layers]) {
      const [scrim, content] = layers!.find((l) => l.id === "edit-profile")!.nodes;
      const enter = content!.motion!.enter![0]!;
      expect(enter.name).toBe("enter");
      expect(enter.duration).toBe(100);
      expect(enter.keyframes[0]!.values["opacity"]).toBe("0");
      expect(enter.keyframes[0]!.values["transform"]).toContain("scale3d(0.95, 0.95, 0.95)");
      expect(content!.motion!.exit![0]!.name).toBe("exit");
      // The scrim fades: its transform keyframe is the identity.
      const fade = scrim!.motion!.enter![0]!;
      expect(fade.keyframes[0]!.values["opacity"]).toBe("0");
      expect(fade.keyframes[0]!.values["transform"]).toContain("scale3d(1, 1, 1)");
    }
    expect(result.code).toMatch(/v_\w+\n +\.markswiftPlaced\(\.center\)\n +\.transition\(\.asymmetric\(/);
  },
  120_000,
);

browserTest(
  "accordion: a closed item's content grows with accordion-down and shrinks with accordion-up",
  async () => {
    const result = await convertHtml(await fixture("overlay-accordion"), { name: "Accordion" });
    const inflow = result.layout.layers!.filter((l: Layer) => l.placement === "inflow");
    expect(inflow.length).toBeGreaterThan(0);
    for (const layer of inflow) {
      const root = layer.nodes[0]!;
      const [down, up] = [root.motion!.enter![0]!, root.motion!.exit![0]!];
      expect(down.name).toBe("accordion-down");
      expect(up.name).toBe("accordion-up");
      expect(down.keyframes.map((k) => k.values["height"])).toEqual(["0px", `${root.bounds.h}px`]);
      expect(up.keyframes.map((k) => k.values["height"])).toEqual([`${root.bounds.h}px`, "0px"]);
    }
    expect(result.code).toContain("MarkswiftReveal(fraction: 0)");
    expect(result.code).toMatch(/withAnimation\(is\w+Expanded \? /);
  },
  120_000,
);
