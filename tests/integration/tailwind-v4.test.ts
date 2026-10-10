import { expect, test } from "bun:test";
import { join } from "node:path";
import { convert } from "../../src/index.ts";
import { BrowserCapture } from "../../src/browser/capture.ts";
import { htmlIdentity } from "../../src/input/identity.ts";
import type { LayoutNode } from "../../src/model/layout.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

async function capture(html: string) {
  const browser = new BrowserCapture({ dpr: 2, viewport: { width: 390, height: 800 } });
  await browser.start();
  try {
    return await browser.capture(
      {
        screen: "t",
        theme: "light",
        url: "http://markswift.test/",
        html,
        root: "[data-markswift-root]",
        screenshot: true,
      },
      htmlIdentity,
      "tailwind-v4-test",
    );
  } finally {
    await browser.stop();
  }
}

function byId(n: LayoutNode, id: string): LayoutNode | undefined {
  if (n.attrs["id"] === id) return n;
  for (const c of n.children) {
    const f = byId(c, id);
    if (f) return f;
  }
  return undefined;
}

browserTest(
  "individual transforms are captured and cancelled in the layout snapshot",
  async () => {
    const { layout } = await capture(
      `<!doctype html><body style="margin:0"><main data-markswift-root style="width:200px;height:140px"><div id="c" style="width:40px;height:40px;rotate:45deg"></div><div id="t" style="width:40px;height:40px;translate:-50% 8px"></div><div id="f" style="margin-left:50px;width:100px;height:40px;scale:0.5"><div id="fx" style="position:fixed;top:10px;left:10px;width:20px;height:20px"></div></div></main></body>`,
    );
    const c = byId(layout.root, "c")!,
      t = byId(layout.root, "t")!,
      fx = byId(layout.root, "fx")!;
    expect(c.bounds).toEqual({ x: 0, y: 0, w: 40, h: 40 });
    expect(c.styles["rotate"]).toBe("45deg");
    expect(t.bounds).toEqual({ x: 0, y: 40, w: 40, h: 40 });
    expect(t.styles["translate"]).toBe("-50% 8px");
    expect(fx.bounds).toEqual({ x: 60, y: 90, w: 20, h: 20 });
  },
  60000,
);

browserTest(
  "a root inside a transformed ancestor keeps its own size and screenshot",
  async () => {
    const { layout, png } = await capture(
      `<!doctype html><body style="margin:0"><div style="margin:20px;transform:scale(0.5);transform-origin:0 0"><main data-markswift-root style="width:200px;height:100px;background:rgb(255,0,0)"></main></div></body>`,
    );
    expect(layout.size).toEqual({ w: 200, h: 100 });
    expect(layout.root.bounds).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    const view = new DataView(png!.buffer, png!.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([400, 200]);
  },
  60000,
);

browserTest(
  "Tailwind v4 fixtures convert without silent gradient or transform loss",
  async () => {
    const dir = join(import.meta.dir, "../conformance/fixtures/tailwind-v4");
    const [transforms, gradients] = await Promise.all(
      ["transforms.html", "gradients.html"].map((f) => convert({ file: join(dir, f) }, { name: "TailwindV4" })),
    );
    for (const result of [transforms!, gradients!]) {
      const lost = result.diagnostics
        .flatMap((d) => d.diagnostics)
        .filter(
          (d) =>
            d.level === "unmapped" &&
            (d.feature.startsWith("background-image") ||
              ["transform", "translate", "rotate", "scale"].includes(d.feature)),
        );
      expect(lost).toEqual([]);
    }

    expect(byId(transforms!.layout.root, "arrow")!.bounds).toMatchObject({ w: 10, h: 10 });
    expect(byId(transforms!.layout.root, "chevron")!.styles["rotate"]).toBe("180deg");
    for (const s of [
      ".rotationEffect(.degrees(180.0)",
      ".rotationEffect(.degrees(45.0)",
      ".scaleEffect(x: 0.95, y: 0.95",
      ".scaleEffect(x: -1.0, y: 1.0",
    ])
      expect(transforms!.code).toContain(s);

    expect(
      gradients!.code.split("startPoint: UnitPoint(x: 0.0, y: 0.5), endPoint: UnitPoint(x: 1.0, y: 0.5)").length - 1,
    ).toBeGreaterThanOrEqual(2);
    const of = (id: string) => gradients!.diagnostics.find((d) => d.id === id)?.diagnostics ?? [];
    for (const id of ["#to-b-hex", "#deg-45"]) expect(of(id).filter((d) => d.level === "unmapped")).toEqual([]);
    expect(of("#to-r-hex")).toContainEqual(
      expect.objectContaining({ level: "approximated", message: expect.stringContaining("oklab") }),
    );
    expect(of("#to-r").filter((d) => d.message.includes("interpolation"))).toEqual([]);
  },
  120000,
);
