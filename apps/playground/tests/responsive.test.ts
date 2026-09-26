import { expect, test } from "bun:test";
import { createPlaygroundHandler } from "../service/app.ts";
import type { PublicResponsiveResult } from "../service/output.ts";

const url = "http://localhost:8787/api/convert";
const request = (body: unknown) => new Request(url, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const input = {
  html: "<main>Hello</main>", css: "main{color:red}", name: "CardView", mode: "fidelity", theme: "dark",
  viewport: { width: 393, height: 852 }, compactWidth: 320, breakpoint: 350,
};
const fixture: PublicResponsiveResult = {
  name: "CardView", files: { "CardView.swift": "struct CardView: View {}" },
  views: [
    { name: "CardViewRegular", code: "regular", mapping: { total: 3, mapped: 3, approximated: 0, unmapped: 0 }, diagnostics: [] },
    { name: "CardViewCompact", code: "compact", mapping: { total: 2, mapped: 1, approximated: 1, unmapped: 0 },
      diagnostics: [{ id: "compact-link", kind: "text", confidence: "approximated", notes: ["Relative link needs navigation mapping."] }] },
  ],
  warnings: ["Two CSS states sampled."],
  branchWarnings: { compact: ["Compact warning"], regular: ["Regular warning"] },
  assets: { "Fonts/Example.ttf": Uint8Array.from([0, 1, 255]) },
};

test("responsive request calls the public API and preserves each branch report", async () => {
  let seen: unknown;
  const handler = createPlaygroundHandler({
    convert: async () => { throw new Error("Single conversion must not run."); },
    convertResponsive: async (source, options) => { seen = { source, options }; return fixture; },
  });
  const response = await handler(request(input));
  expect(response.status).toBe(200);
  expect(seen).toEqual({ source: { html: input.html }, options: {
    css: input.css, name: "CardView", mode: "fidelity", theme: "dark", untrustedInput: true,
    compact: { viewport: { width: 320, height: 852 } }, regular: { viewport: { width: 393, height: 852 } }, breakpoint: 350,
  } });
  const result = await response.json();
  expect(result.files).toEqual(fixture.files);
  expect(result.assets).toEqual({ "Fonts/Example.ttf": "AAH/" });
  expect(result.warnings).toEqual(fixture.warnings);
  expect(result.breakpoint).toBe(350);
  expect(result.branches).toEqual([
    { branch: "compact", name: "CardViewCompact", width: 320, height: 852,
      mapping: fixture.views[1]!.mapping, diagnostics: fixture.views[1]!.diagnostics, warnings: ["Compact warning"] },
    { branch: "regular", name: "CardViewRegular", width: 393, height: 852,
      mapping: fixture.views[0]!.mapping, diagnostics: [], warnings: ["Regular warning"] },
  ]);
  expect(result.mapping).toBeUndefined();
  expect(result.layouts).toBeUndefined();
  expect(result.views).toBeUndefined();
});

test("responsive controls reject incomplete, unbounded and inconsistent pairs before conversion", async () => {
  let calls = 0;
  const handler = createPlaygroundHandler({
    convert: async () => { throw new Error("unexpected single conversion"); },
    convertResponsive: async () => { calls++; return fixture; },
  });
  for (const changes of [
    { compactWidth: undefined }, { breakpoint: undefined }, { viewport: undefined },
    { compactWidth: 239 }, { compactWidth: 1921 }, { compactWidth: 320.5 }, { compactWidth: "320" },
    { breakpoint: 239 }, { breakpoint: 1920 }, { breakpoint: 350.5 }, { breakpoint: null },
    { compactWidth: 351 }, { breakpoint: 393 }, { breakpoint: 500 },
    { compactWidth: 393, breakpoint: 393 }, { viewport: { width: 239, height: 852 } },
    { url: "https://example.com" }, { file: "/etc/passwd" }, { untrustedInput: false },
  ]) {
    const response = await handler(request({ ...input, ...changes }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeString();
  }
  expect(calls).toBe(0);
  const inclusiveCompact = await handler(request({ ...input, compactWidth: 350 }));
  expect(inclusiveCompact.status).toBe(200);
  expect(calls).toBe(1);
});

test("a responsive conversion consumes one admission slot and releases it after failure", async () => {
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const handler = createPlaygroundHandler({ maxConcurrent: 1, logError: () => {}, convertResponsive: async () => {
    if (++calls === 1) { entered(); await pending; throw new Error("Second capture failed."); }
    return fixture;
  } });
  const first = handler(request(input));
  await started;
  expect((await handler(request(input))).status).toBe(429);
  release();
  expect((await first).status).toBe(500);
  expect((await handler(request(input))).status).toBe(200);
});

test("missing public branch result is an error instead of an invented mapping score", async () => {
  const handler = createPlaygroundHandler({ logError: () => {}, convertResponsive: async () => ({ ...fixture, views: [fixture.views[0]!] }) });
  expect((await handler(request(input))).status).toBe(500);
});

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;

browserTest("isolated real Chrome responsive conversion samples CSS states and blocks pasted scripts", async () => {
  const handler = createPlaygroundHandler();
  const response = await handler(request({
    html: `<main data-markswift-root><p>Kept text</p><p class="wide"><a href="#details">Wide details</a></p></main>
      <script>document.querySelector('main').textContent = 'Executed script';</script>`,
    css: "body{margin:0} main{background:#123456;color:white;padding:16px} @media(max-width:350px){.wide{display:none}}",
    name: "ResponsiveCard", viewport: { width: 393, height: 852 }, compactWidth: 320, breakpoint: 350,
  }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.files["ResponsiveCard.swift"]).toContain("MarkswiftResponsiveLayout(breakpoint: 350)");
  expect(result.files["MarkswiftResponsiveLayout.swift"]).toContain("Layout");
  expect(result.files["ResponsiveCardCompact.swift"]).toContain("Kept text");
  expect(result.files["ResponsiveCardCompact.swift"]).not.toContain("Wide details");
  expect(result.files["ResponsiveCardRegular.swift"]).toContain("Wide details");
  expect(Object.values(result.files).join("\n")).not.toContain("Executed script");
  expect(result.branches.map((branch: { branch: string; width: number }) => [branch.branch, branch.width])).toEqual([["compact", 320], ["regular", 393]]);
  expect(result.branches[1].mapping.total).toBeGreaterThan(result.branches[0].mapping.total);
  expect(JSON.stringify(result.branches[1].diagnostics)).toContain("destination dropped");
  expect(JSON.stringify(result.branches[0].diagnostics)).not.toContain("destination dropped");
  expect(result.warnings.join("\n")).toContain("sampled at compact 320px and regular 393px");
  expect(result.branches.every((branch: { warnings: unknown }) => Array.isArray(branch.warnings))).toBe(true);
  expect(result.layouts).toBeUndefined();
  expect(result.mapping).toBeUndefined();
}, 30_000);
