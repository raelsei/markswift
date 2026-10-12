import { expect, test } from "bun:test";
import { convertHtml } from "../../src/index.ts";
import { formatWarning } from "../../src/cli/output.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

const HTML =
  "<main data-markswift-root>" +
  '<div class="row"><div id="shrunk"></div><div id="wide"></div></div>' +
  '<div id="half">half</div>' +
  '<div id="fit"><i>1</i><i>2</i><i>3</i><i>4</i></div>' +
  '<div class="split"><p class="title">Title</p></div>' +
  '<div class="card"><div class="inner">inner</div></div>' +
  '<form><input id="email" type="email" required></form>' +
  "</main>";
const CSS = `html,body{margin:0}main{width:390px;font:15px/20px system-ui}
  .row{display:flex;width:300px;height:20px}#shrunk{width:150px;box-sizing:border-box}#wide{width:300px;box-sizing:border-box}
  #half{width:50%}
  #fit{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px}#fit>i{height:20px;background:#ddd}
  @media (min-width: 600px){.split{display:flex}.title{font-size:24px}}
  .card{container-type:inline-size}@container (min-width: 400px){.inner{padding:20px}}
  input:invalid{border:2px solid red}`;

browserTest(
  "breakpoints, width and grid pins and baked validation styling are reported",
  async () => {
    const convert = (mode: "app" | "fidelity") =>
      convertHtml(HTML, { name: "SilentPins", css: CSS, mode, theme: "light", viewport: { width: 390, height: 900 } });
    const result = await convert("app");
    const media = result.warnings.find((w) => w.feature === "media-query");
    expect(media).toMatchObject({ source: "capture", level: "approximated", feature: "media-query" });
    expect(media!.message).toContain("@media (min-width: 600px)");
    expect(media!.message).toContain(".split");
    expect(media!.message).toContain(".title");
    expect(result.warnings.find((w) => w.feature === "container-query")?.message).toContain(".inner");
    expect(formatWarning(media!)).toStartWith("approximated media-query: @media (min-width: 600px)");

    const notes = (r: typeof result, id: string) =>
      r.diagnostics
        .filter((d) => d.id === id)
        .flatMap((d) => d.diagnostics)
        .map((d) => `${d.feature}: ${d.message}`)
        .join("\n");
    // The shrunk 150px item sits in an admitted row: app mode reflows it (MarkswiftFlexRow), fidelity pins the row.
    expect(notes(result, "#shrunk")).not.toContain("laid out at");
    expect(result.code).toContain("MarkswiftFlexRow(");
    expect(notes(result, "#email")).toContain(":invalid: ");
    // Its items have a px height, so the auto-fit grid is not admitted and stays pinned in app mode.
    expect(notes(result, "#fit")).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)) pinned at 3 columns",
    );
    // App mode keeps the fraction (MarkswiftFraction); fidelity pins it with the same note.
    expect(notes(result, "#half")).not.toContain("pinned");
    const fidelity = await convert("fidelity");
    expect(notes(fidelity, "#half")).toContain("width: width 50% pinned at 195px");
    expect(fidelity.diagnostics.flatMap((d) => d.diagnostics)).toContainEqual(
      expect.objectContaining({ feature: "flex-shrink", message: expect.stringContaining("shrunk flex items pinned") }),
    );
  },
  60000,
);

browserTest(
  "a colour-scheme media query is not a breakpoint",
  async () => {
    const result = await convertHtml("<main data-markswift-root><p>plain</p></main>", {
      css: "@media (prefers-color-scheme: dark){p{color:white}}",
      theme: "light",
    });
    expect(result.warnings).toEqual([]);
  },
  60000,
);
