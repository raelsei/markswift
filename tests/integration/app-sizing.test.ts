/** Plan 010 capture facts: the viewport in root coordinates, Typed-OM insets, computed object-position. */
import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest(
  "capture records the viewport in root coordinates",
  async () => {
    const result = await convertHtml('<main data-markswift-root style="min-height:100vh"><p>Hi</p></main>', {
      css: "html,body{margin:0}",
      viewport: { width: 390, height: 844 },
    });
    expect(result.layout.viewport).toEqual({ x: 0, y: 0, w: 390, h: 844 });
  },
  60000,
);

browserTest(
  "capture keeps Typed-OM insets of positioned boxes and the computed object-position",
  async () => {
    const result = await convertHtml(
      '<main data-markswift-root style="position:relative;height:200px"><div id="x" style="position:absolute;right:16px;top:8px;width:20px;height:20px;background:red"></div><img id="i" style="object-position:top;object-fit:cover;width:50px;height:50px" src="data:image/png;base64,iVBORw0KGgo="></main>',
      { css: "html,body{margin:0}", viewport: { width: 390, height: 844 } },
    );
    const [x, i] = ["x", "i"].map((id) => result.layout.root.children.find((c) => c.attrs["id"] === id)!);
    expect(x!.preferredSize?.insets).toEqual({ top: "8px", right: "16px", bottom: "auto", left: "auto" });
    expect(i!.styles["object-position"]).toBe("50% 0%");
  },
  60000,
);
