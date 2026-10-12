import { LAYOUT_DOC_VERSION } from "../../src/model/layout.ts";
import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, convertHtml } from "../../src/index.ts";
import { compileLayout } from "../../src/compiler/index.ts";
import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";
import { typecheck } from "../../tools/verify/typecheck.ts";
import { typecheckLoose } from "../../tools/verify/typecheck-loose.ts";
import { buildRenderApp, renderMac } from "../../tools/verify/native.ts";
import { command } from "../../tools/verify/process.ts";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { compare } from "../../tools/verify/compare.ts";
import { forceStates } from "../../src/browser/states.ts";
import { PRESSABLE_SELECTOR, TEXT_ENTRY_SELECTOR } from "../../src/model/interactive.ts";
import {
  GRID_RADIO,
  GRID_RADIO_CSS,
  ICONS,
  ICONS_CSS,
  PREFS,
  PREFS_CSS,
  SETTINGS,
  SETTINGS_CSS,
  TEAM,
  TEAM_CSS,
} from "../helpers/component-fixtures.ts";

const nativeTest = process.env.MARKSWIFT_SWIFT_TESTS === "1" ? test : test.skip;

const PUBLIC_HTML =
  '<main data-markswift-root><h2>Hello</h2><label>Name<input value="Ada"></label><button>Save</button><p>Visit <a href="https://example.com">our site</a> today.</p><a style="display:block" href="https://example.com">Open site</a><section style="max-width:50%;padding:4px"><p style="min-height:30px">Floor</p><p style="max-height:10px;overflow:hidden">Clipped</p><span style="display:inline-block;max-width:200px">Hi</span></section><svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="red"/></svg></main>';
const PUBLIC_CSS =
  "body{margin:0} main{width:300px;padding:20px;font:16px system-ui;background:#eee} h2{font-size:24px}label{display:block}";

nativeTest(
  "public conversion produces complete Swift compilable in both modes",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-api-"));
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const result = await convertHtml(PUBLIC_HTML, { name: "ExampleCard", mode, css: PUBLIC_CSS });
        expect(result.code).toContain("Link(destination:");
        expect(result.code).toContain("minHeight: 30.0");
        expect(result.code).toContain("height: 10.0, alignment: .topLeading");
        expect(result.code).toContain("maxWidth: 200.0");
        expect(result.code).toContain('Text.markswiftLink("our site", "https://example.com"');
        expect(result.code).toContain("Button(action: onSave)");
        const output = join(directory, mode);
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
        const check = await typecheck(output);
        if (!check.ok) throw new Error(check.output);
        expect(check.ok).toBe(true);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

nativeTest(
  "public conversion renders on macOS in both modes",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-mac-"));
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const result = await convertHtml(PUBLIC_HTML, { name: "ExampleCard", mode, css: PUBLIC_CSS });
        const png = join(directory, `${mode}.png`);
        await renderMac(result, join(directory, mode, "mac"), png);
        const meta = await sharp(png).metadata();
        expect([meta.width, meta.height]).toEqual([result.layout.size.w * 2, result.layout.size.h * 2]);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  240000,
);

nativeTest(
  "027: action members and inline links compile and keep the link colour",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-027-"));
    const html =
      '<main data-markswift-root><form onsubmit="send(event)"><input value="Ada"><button>Go</button></form><div role="button" onclick="openMenu()">Menu</div><p class="t">XX <a href="#faq">LLLL</a> <a href="https://example.com">ext</a></p><div class="sw"></div></main>';
    const css =
      "body{margin:0} main{width:300px;padding:16px;background:#fff;font:16px system-ui} .t{font:900 40px system-ui;color:#000} .t a{color:#c81e1e;text-decoration:none} .sw{width:40px;height:40px;background:#c81e1e}";
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const result = await convertHtml(html, { name: "Actions027", mode, css, theme: "light" });
        const output = join(directory, mode);
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
        const check = await typecheck(output);
        if (!check.ok) throw new Error(check.output);
        if (mode !== "fidelity") continue;
        const png = join(directory, "fidelity.png");
        await renderMac(result, join(directory, "mac"), png);
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        const find = (n: LayoutNode, hit: (n: LayoutNode) => boolean): LayoutNode | undefined =>
          hit(n) ? n : n.children.map((c) => find(c, hit)).find(Boolean);
        // The render's own scale (the macOS renderer draws at 2× whatever the capture's dpr was).
        const dpr = info.width / result.layout.size.w;
        // The most frequent saturated red-ish colour inside a box: the link glyphs / the swatch.
        const dominant = (n: LayoutNode | undefined): number[] => {
          if (!n) throw new Error("box not found");
          const counts = new Map<string, number>();
          const { x, y, w, h } = n.bounds;
          for (let py = Math.round(y * dpr); py < Math.round((y + h) * dpr); py++)
            for (let px = Math.round(x * dpr); px < Math.round((x + w) * dpr); px++) {
              const i = (py * info.width + px) * info.channels;
              const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
              const max = Math.max(r, g, b);
              if (max - Math.min(r, g, b) <= 0.5 * max || r <= b) continue;
              const key = `${r},${g},${b}`;
              counts.set(key, (counts.get(key) ?? 0) + 1);
            }
          const best = [...counts].sort((a, b) => b[1] - a[1])[0];
          if (!best) throw new Error("no saturated red pixels in the box (the link drew in the accent colour?)");
          return best[0].split(",").map(Number);
        };
        const link = dominant(find(result.layout.root, (n) => n.tag === "p"));
        const swatch = dominant(find(result.layout.root, (n) => /\bsw\b/.test(n.attrs["class"] ?? "")));
        for (let c = 0; c < 3; c++) expect(Math.abs(link[c]! - swatch[c]!)).toBeLessThanOrEqual(3);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  240000,
);

nativeTest(
  "iOS render app builds two captures into one simulator app",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-ios-"));
    try {
      const a = await convertHtml(PUBLIC_HTML, { name: "ExampleCardApp", mode: "app", css: PUBLIC_CSS });
      const b = await convertHtml(PUBLIC_HTML, { name: "ExampleCardFidelity", mode: "fidelity", css: PUBLIC_CSS });
      const app = await buildRenderApp(
        [
          { result: a, output: "/tmp/a.png" },
          { result: b, output: "/tmp/b.png" },
        ],
        join(directory, "ios"),
      );
      expect((await command(["vtool", "-show-build", join(app, "Render")])).includes("IOSSIMULATOR")).toBe(true);
      expect(await Bun.file(join(app, "Info.plist")).exists()).toBe(true);
      await expect(
        buildRenderApp(
          [
            { result: a, output: "/tmp/a.png" },
            { result: a, output: "/tmp/b.png" },
          ],
          join(directory, "dup"),
        ),
      ).rejects.toThrow("duplicate generated file");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  240000,
);

nativeTest(
  "accessible forms compile in both modes",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-a11y-"));
    try {
      const fixture = await Bun.file(join(import.meta.dir, "../conformance/fixtures/html/input.html")).text();
      const css = /<style>([\s\S]*)<\/style>/.exec(fixture)![1]!;
      const main = /<main[\s\S]*<\/main>/
        .exec(fixture)![0]!
        .replace(
          "</main>",
          '<button aria-label="Close">×</button><h2>Settings</h2><input type="email" aria-label="Work email"></main>',
        );
      for (const mode of ["app", "fidelity"] as const) {
        const result = await convertHtml(main, { name: "AccessibleForm", mode, css });
        if (mode === "app") {
          for (const s of [
            '.accessibilityLabel("Close")',
            ".accessibilityHeading(.h2)",
            ".markswiftSelects(",
            ".markswiftInputTraits(.email)",
            "@ScaledMetric(relativeTo:",
          ])
            expect(result.code).toContain(s);
        }
        const output = join(directory, mode);
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
        const check = await typecheck(output);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

nativeTest(
  "028: ARIA and input traits compile in both modes",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-028-"));
    const html =
      '<main data-markswift-root><span id="t1">Billing</span> <span id="t2">address</span><input aria-labelledby="t1 t2" aria-label="X"><p id="h">We never share it</p><input aria-describedby="h"><div aria-description="Opens in a sheet">Details</div><div role="progressbar" aria-valuenow="40" aria-valuetext="40 percent">40%</div><button role="tab" aria-selected="true">Plans</button><a href="/x" aria-current="page" style="display:block">Home</a><div role="checkbox" aria-checked="true">Agree</div><button aria-disabled="true">Pay</button><div role="button" onclick="pay()" aria-disabled="true">Pay now</div><button aria-expanded="false">More</button><input autocomplete="shipping given-name"><input type="email" autocomplete="email"><input autocomplete="one-time-code"><input inputmode="numeric"><input enterkeyhint="send"><input type="password" autocomplete="new-password" enterkeyhint="go"><span role="link" onclick="go()" style="display:inline-block">Go</span><a href="#faq" style="display:block">FAQ</a></main>';
    const css = "body{margin:0} main{width:300px;padding:16px;font:16px system-ui;background:#fff}";
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const result = await convertHtml(html, { name: "Aria028", mode, css });
        if (mode === "app") expect(result.code).toContain('autofill: "one-time-code"');
        const output = join(directory, mode);
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
        const check = await typecheck(output);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

nativeTest(
  "adaptive light/dark conversion compiles",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-adaptive-"));
    try {
      const result = await convertHtml(
        '<main data-markswift-root><h2>Account</h2><p class="note">Signed in</p><progress value="40" max="100"></progress></main>',
        {
          name: "AdaptiveCard",
          css: "body{margin:0} main{width:280px;padding:16px;font:16px system-ui;background:#fff;color:#111} .note{color:#555} @media (prefers-color-scheme: dark){main{background:#16181d;color:#f2f2f2}.note{color:#a0a4ab}}",
        },
      );
      expect(result.files["AdaptiveCard+Tokens.swift"]).toContain("= Color.markswift(light:");
      expect(result.code).toContain("Color.markswift(light: Color.markswift(");
      for (const [file, content] of Object.entries(result.files)) await Bun.write(join(directory, file), content);
      const check = await typecheck(directory);
      if (!check.ok) throw new Error(check.output);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

nativeTest(
  "009: silent-loss fixes emit compilable Swift in both modes",
  async () => {
    const BASE = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };
    const node = (
      tag: string,
      bounds: LayoutNode["bounds"],
      styles: Record<string, string>,
      children: LayoutNode[] = [],
      attrs: Record<string, string> = {},
    ): LayoutNode => ({ tag, attrs, styles: { ...BASE, ...styles }, bounds, children });
    const text = (s: string, bounds: LayoutNode["bounds"]): LayoutNode => ({
      tag: "#text",
      attrs: {},
      styles: { ...BASE },
      bounds,
      text: s,
      children: [],
    });
    const CLIP = {
      "background-clip": "text",
      "background-image": "linear-gradient(to right, rgb(255, 0, 0), rgb(0, 0, 255))",
      "-webkit-text-fill-color": "rgba(0, 0, 0, 0)",
    };
    const root = node("main", { x: 0, y: 0, w: 300, h: 380 }, { display: "block" }, [
      node(
        "div",
        { x: 0, y: 0, w: 40, h: 40 },
        { display: "block", transform: "matrix(-1, 0, 0, 1, 0, 0)", "background-color": "rgb(255, 0, 0)" },
      ),
      node(
        "div",
        { x: 0, y: 40, w: 300, h: 50 },
        {
          display: "grid",
          "grid-template-columns": "300px",
          "grid-template-rows": "30px 30px 30px",
          "row-gap": "0px",
          "overflow-y": "auto",
        },
        [0, 30, 60].map((y) =>
          node("div", { x: 0, y: 40 + y, w: 300, h: 30 }, { display: "block", "background-color": "rgb(0, 0, 255)" }),
        ),
      ),
      node("td", { x: 0, y: 90, w: 300, h: 20 }, { display: "table-cell" }, [
        text("\u00A0", { x: 0, y: 93, w: 4, h: 14 }),
      ]),
      node("p", { x: 0, y: 110, w: 300, h: 20 }, { display: "block" }, [
        text("Hello ", { x: 0, y: 113, w: 40, h: 14 }),
        node("span", { x: 40, y: 113, w: 45, h: 14 }, { visibility: "hidden" }, [
          text("secret", { x: 40, y: 113, w: 45, h: 14 }),
        ]),
        text(" world", { x: 85, y: 113, w: 40, h: 14 }),
      ]),
      node("h1", { x: 0, y: 130, w: 300, h: 40 }, { display: "block", ...CLIP }, [
        text("Build ", { x: 0, y: 140, w: 60, h: 20 }),
        node("span", { x: 60, y: 140, w: 70, h: 20 }, { "-webkit-text-fill-color": "rgba(0, 0, 0, 0)" }, [
          text("faster", { x: 60, y: 140, w: 70, h: 20 }),
        ]),
      ]),
      {
        ...node("img", { x: 0, y: 170, w: 40, h: 40 }, { display: "inline" }),
        currentSrc:
          "data:image/svg+xml," + encodeURIComponent('<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>'),
      },
    ]);
    const doc: LayoutDoc = {
      version: LAYOUT_DOC_VERSION,
      source: "silent-loss",
      combo: { screen: "s", theme: "light" },
      size: { w: 300, h: 380 },
      dpr: 1,
      canvas: "rgb(255, 255, 255)",
      fonts: [],
      root,
    };
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-009-"));
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const result = compileLayout(doc, { name: "SilentLoss", mode });
        if (mode === "app") expect(result.code).toContain(".scaleEffect(x: -1.0");
        const output = join(directory, mode);
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
        const check = await typecheck(output);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

nativeTest(
  "010: app-sizing output compiles in both modes",
  async () => {
    const BASE = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };
    const node = (
      tag: string,
      bounds: LayoutNode["bounds"],
      styles: Record<string, string>,
      extra: Partial<LayoutNode> = {},
    ): LayoutNode => ({ tag, attrs: {}, styles: { ...BASE, ...styles }, bounds, children: [], ...extra });
    const image = (x: number, fit: string, position?: string) =>
      node(
        "img",
        { x, y: 0, w: 70, h: 100 },
        { display: "inline", "object-fit": fit, ...(position ? { "object-position": position } : {}) },
        { attrs: { src: "photo.png" }, currentSrc: PNG, paint: 1 },
      );
    const root = node(
      "main",
      { x: 0, y: 0, w: 390, h: 2000 },
      { display: "block", position: "relative" },
      {
        paint: 0,
        children: [
          node(
            "div",
            { x: 0, y: 0, w: 390, h: 100 },
            { display: "block" },
            {
              paint: 1,
              children: [
                image(0, "fill"),
                image(70, "cover", "50% 0%"),
                image(140, "contain"),
                image(210, "none"),
                image(280, "scale-down"),
              ],
            },
          ),
          node(
            "input",
            { x: 0, y: 100, w: 200, h: 38 },
            { display: "inline-block" },
            { attrs: { type: "text", value: "a" }, paint: 1 },
          ),
          node(
            "div",
            { x: 0, y: 138, w: 390, h: 1862 },
            { display: "block", "background-color": "rgb(240, 240, 240)" },
            { paint: 1 },
          ),
          node(
            "div",
            { x: 354, y: 8, w: 20, h: 20 },
            { display: "block", position: "absolute", "background-color": "rgb(255, 0, 0)" },
            {
              paint: 2,
              preferredSize: {
                width: "20px",
                height: "20px",
                insets: { top: "8px", right: "16px", bottom: "auto", left: "auto" },
              },
            },
          ),
          node(
            "div",
            { x: 0, y: 784, w: 390, h: 60 },
            { display: "block", position: "fixed", "background-color": "rgb(0, 0, 255)" },
            {
              paint: 3,
              preferredSize: {
                width: "390px",
                height: "60px",
                insets: { top: "auto", right: "0px", bottom: "0px", left: "0px" },
              },
            },
          ),
        ],
      },
    );
    const doc: LayoutDoc = {
      version: LAYOUT_DOC_VERSION,
      source: "app-sizing",
      combo: { screen: "s", theme: "light" },
      size: { w: 390, h: 2000 },
      viewport: { x: 0, y: 0, w: 390, h: 844 },
      dpr: 1,
      canvas: "rgb(255, 255, 255)",
      fonts: [],
      root,
    };
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-010-"));
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const result = compileLayout(doc, { name: "AppSizing", mode });
        if (mode === "app")
          for (const marker of ["ScrollView(.vertical", ".overlay(alignment: .bottomLeading)", "minHeight: 38.0"])
            expect(result.code).toContain(marker);
        const output = join(directory, mode);
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
        const check = await typecheck(output);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

nativeTest(
  "011: flex and direction output compiles in both modes",
  async () => {
    const BASE = { color: "rgb(0, 0, 0)", "font-family": "system-ui", "font-size": "14px", "line-height": "20px" };
    const node = (
      tag: string,
      bounds: LayoutNode["bounds"],
      styles: Record<string, string>,
      extra: Partial<LayoutNode> = {},
    ): LayoutNode => ({ tag, attrs: {}, styles: { ...BASE, ...styles }, bounds, children: [], ...extra });
    const box = (
      x: number,
      y: number,
      w: number,
      h: number,
      styles: Record<string, string> = {},
      extra: Partial<LayoutNode> = {},
    ) => node("div", { x, y, w, h }, { display: "block", "background-color": "rgb(255, 0, 0)", ...styles }, extra);
    const text = (value: string, bounds: LayoutNode["bounds"]): LayoutNode =>
      node("#text", bounds, {}, { text: value });
    const chip = (x: number, y: number) =>
      node(
        "span",
        { x, y, w: 60, h: 28 },
        {
          display: "block",
          "flex-shrink": "1",
          "padding-left": "12px",
          "padding-right": "12px",
          "padding-top": "4px",
          "padding-bottom": "4px",
        },
        {
          preferredSize: { width: "auto", height: "auto" },
          children: [text("Design", { x: x + 12, y: y + 7, w: 36, h: 14 })],
        },
      );
    const fixedWidth = (w: number, h = "auto") => ({ preferredSize: { width: `${w}px`, height: h } });
    const root = node(
      "main",
      { x: 0, y: 0, w: 390, h: 634 },
      { display: "block" },
      {
        children: [
          node(
            "div",
            { x: 0, y: 0, w: 300, h: 40 },
            { display: "flex", "flex-direction": "row-reverse", "justify-content": "flex-end" },
            { children: [box(50, 0, 50, 40), box(0, 0, 50, 40)] },
          ),
          node(
            "div",
            { x: 0, y: 40, w: 300, h: 40 },
            { display: "flex", "align-items": "flex-start" },
            { children: [box(0, 40, 50, 40), box(60, 60, 50, 20, { "align-self": "flex-end" })] },
          ),
          node(
            "div",
            { x: 0, y: 80, w: 300, h: 100 },
            { display: "flex", "flex-direction": "column", "align-items": "stretch" },
            { children: [box(125, 80, 50, 20, { "align-self": "center" })] },
          ),
          node(
            "div",
            { x: 0, y: 180, w: 180, h: 66 },
            {
              display: "flex",
              "flex-wrap": "wrap",
              "column-gap": "10px",
              "row-gap": "10px",
              "align-items": "flex-start",
            },
            { ...fixedWidth(180), children: [chip(0, 180), chip(70, 180), chip(0, 218)] },
          ),
          node(
            "nav",
            { x: 0, y: 246, w: 300, h: 20 },
            { display: "flex", "column-gap": "8px" },
            {
              ...fixedWidth(300),
              children: [
                box(0, 246, 40, 20),
                box(
                  262,
                  246,
                  38,
                  20,
                  { "margin-left": "214px" },
                  { preferredSize: { width: "auto", height: "auto", autoMargins: ["left"] } },
                ),
              ],
            },
          ),
          node(
            "div",
            { x: 0, y: 266, w: 200, h: 300 },
            { display: "flex", "flex-direction": "column" },
            {
              ...fixedWidth(200, "300px"),
              children: [
                box(0, 266, 200, 20),
                box(
                  0,
                  536,
                  200,
                  30,
                  { "margin-top": "250px" },
                  { preferredSize: { width: "auto", height: "auto", autoMargins: ["top"] } },
                ),
              ],
            },
          ),
          node(
            "div",
            { x: 0, y: 566, w: 300, h: 20 },
            { display: "flex", "justify-content": "space-between", "column-gap": "16px" },
            { ...fixedWidth(300), children: [box(0, 566, 40, 20), box(260, 566, 40, 20)] },
          ),
          node(
            "div",
            { x: 0, y: 586, w: 120, h: 28 },
            { display: "flex", "flex-wrap": "nowrap", "overflow-x": "hidden" },
            { children: [chip(0, 586)] },
          ),
          node(
            "div",
            { x: 0, y: 614, w: 200, h: 20 },
            { display: "block", "text-align": "-webkit-center" },
            { children: [text("Hi", { x: 90, y: 617, w: 20, h: 14 })] },
          ),
        ],
      },
    );
    const doc: LayoutDoc = {
      version: LAYOUT_DOC_VERSION,
      source: "flex-direction",
      combo: { screen: "s", theme: "light" },
      size: { w: 390, h: 634 },
      dpr: 1,
      canvas: "rgb(255, 255, 255)",
      fonts: [],
      root,
    };
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-011-"));
    try {
      for (const mode of ["app", "fidelity"] as const) {
        const result = compileLayout(doc, { name: "FlexDirection", mode });
        if (mode === "app")
          for (const marker of [
            "MarkswiftFlow(",
            "Spacer(minLength: 8.0)",
            "Spacer(minLength: 16.0)",
            "maxHeight: .infinity, alignment: .bottom",
            ".fixedSize(horizontal: true, vertical: true)",
          ])
            expect(result.code).toContain(marker);
        const output = join(directory, mode);
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(output, file), content);
        const check = await typecheck(output);
        if (!check.ok) throw new Error(check.output);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);

const ASSETS = join(import.meta.dir, "../conformance/fixtures/assets");
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SHARED =
  '<div style="width:40px;height:20px;background:var(--primary)"></div><div style="width:40px;height:20px;background:var(--primary)"></div><svg width="20" height="20" viewBox="0 0 20 20"><path d="M2 2h16v16H2z" fill="#16a34a"/></svg>';
const EFFECTS = [
  "filter:blur(2px)",
  "filter:brightness(1.2) contrast(1.1) saturate(.5) hue-rotate(45deg)",
  "filter:invert(1)",
  "filter:sepia(.6)",
  "filter:drop-shadow(2px 2px 2px #0008)",
  "mix-blend-mode:multiply",
  "background:#fff8;backdrop-filter:blur(4px)",
  "clip-path:polygon(50% 0,100% 100%,0 100%)",
  "mask-image:linear-gradient(#000,transparent)",
  "transform:rotate(12deg) scale(.9)",
  "box-shadow:inset 0 2px 4px #0006,0 4px 8px #0004;border-radius:8px",
];
/**
 * One bundle per emitter family. `app` markers prove the family reached its emitter (checked in
 * app mode only: fidelity paints controls statically); a marker ending in `.swift` is a file name.
 */
const FAMILIES: Array<{ name: string; html: string; css?: string; assetsDir?: string; app: string[] }> = [
  {
    name: "EffectsFamily",
    html: EFFECTS.map((s) => `<div style="width:40px;height:40px;background:#e11d48;${s}"></div>`).join(""),
    css: "main{display:flex;flex-wrap:wrap;gap:8px;padding:8px}",
    app: [".colorInvert()", ".hueRotation(", ".blendMode(", "MarkswiftClip_"],
  },
  {
    name: "ControlsFamily",
    html: '<input type="text" placeholder="Name"><input type="checkbox" checked><input type="radio" name="r" checked><input type="range" value="30"><input type="date" value="2026-10-10"><input type="color" value="#2563eb"><input type="file"><input type="number" value="3"><select><option>One</option><option selected>Two</option></select><textarea>Notes</textarea><textarea placeholder="Note"></textarea><input type="time" value="10:30"><input type="datetime-local" value="2026-10-10T09:15"><input type="submit" value="Send"><input type="range" value="20" style="accent-color:#e11d48"><select style="appearance:none"><option>A</option></select><progress value="40" max="100"></progress><meter value="0.6"></meter><details open><summary>More</summary><p>Body</p></details><button>Save</button><a href="https://example.com">Link</a>',
    css: "main{display:flex;flex-direction:column;gap:6px;padding:8px}",
    app: [
      "Slider(",
      "DatePicker(",
      "ColorPicker(",
      "TextEditor(",
      "DisclosureGroup(",
      ".fileImporter(",
      "Link(destination:",
      "MarkswiftDisclosureStyle(",
      "Menu {",
      ".hourAndMinute",
      ".markswiftTextEditorInsets()",
      'Text(verbatim: "Send")',
    ],
  },
  {
    name: "SvgFamily",
    html: '<svg width="160" height="80" viewBox="0 0 160 80"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#e11d48"/></linearGradient><radialGradient id="rg"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><clipPath id="cp"><circle cx="120" cy="40" r="30"/></clipPath></defs><rect width="80" height="80" fill="url(#lg)"/><rect x="80" width="80" height="80" fill="url(#rg)" clip-path="url(#cp)"/><text x="4" y="70" font-size="12">SVG</text></svg>',
    app: ["LinearGradient(", "RadialGradient(", "MarkswiftShape_"],
  },
  {
    name: "ImageFamily",
    html: `<img style="width:40px;height:40px" src="${PNG}"><img style="width:40px;height:40px" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><circle cx='5' cy='5' r='4' fill='red'/></svg>"><div style="width:120px;height:40px;background:url(${PNG}) repeat;background-size:8px 8px"></div>`,
    app: ["Image.markswiftAsset("],
  },
  {
    name: "WebfontFamily",
    assetsDir: ASSETS,
    html: "<p>Geist text</p>",
    css: '@font-face{font-family:Geist;src:url(geist-latin-wght-normal.woff2) format("woff2");font-weight:100 900} main{font-family:Geist}',
    app: ["WebfontFamily+Fonts.swift", '.custom("Geist"'],
  },
  {
    name: "EscapesFamily",
    html: '<pre>a\u000bb</pre><img alt="x\u0001y" src="missing.png" style="width:60px;height:20px"><input placeholder="p\u000cq">',
    app: ["\\u{b}", "\\u{c}"],
  },
  // Identical sources: identical token names and shape hashes in two views of one target.
  { name: "CoexistA", html: SHARED, app: ["Palette.primary", "MarkswiftShape_"] },
  { name: "CoexistB", html: SHARED, app: ["Palette.primary", "MarkswiftShape_"] },
];

for (const mode of ["app", "fidelity"] as const) {
  nativeTest(
    `every emitter family compiles, all bundles in one target (${mode})`,
    async () => {
      const directory = await mkdtemp(join(tmpdir(), `markswift-native-matrix-${mode}-`));
      try {
        let runtime: string | undefined;
        for (const f of FAMILIES) {
          const result = await convert(
            { html: `<main data-markswift-root>${f.html}</main>`, ...(f.assetsDir ? { assetsDir: f.assetsDir } : {}) },
            {
              name: f.name,
              mode,
              css: `body{margin:0} :root{--primary:#2563eb} main{width:320px;font:16px system-ui} ${f.css ?? ""}`,
            },
          );
          if (mode === "app") {
            const all = Object.values(result.files).join("\n");
            for (const marker of f.app) {
              if (marker.endsWith(".swift")) expect(Object.keys(result.files)).toContain(marker);
              else expect(all).toContain(marker);
            }
          }
          for (const [file, content] of Object.entries(result.files)) {
            if (file === "MarkswiftRuntime.swift") {
              runtime ??= content;
              expect(content).toBe(runtime);
            } else expect(await Bun.file(join(directory, file)).exists()).toBe(false);
            await Bun.write(join(directory, file), content);
          }
        }
        const check = await typecheck(directory);
        if (!check.ok) throw new Error(check.output);
        const loose = await typecheckLoose(directory);
        if (!loose.ok) throw new Error(loose.output);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    300000,
  );
}

/** Write FAMILIES entries as HTML pages (plus the Geist webfont they may load) and `markswift build` them as `library`. */
async function buildFamilies(dir: string, library: string, components: Array<{ name: string; family: string }>) {
  await mkdir(dir, { recursive: true });
  await copyFile(join(ASSETS, "geist-latin-wght-normal.woff2"), join(dir, "geist-latin-wght-normal.woff2"));
  for (const { name, family } of components) {
    const f = FAMILIES.find((f) => f.name === family)!;
    const css = `body{margin:0} :root{--primary:#2563eb} main{width:320px;font:16px system-ui} ${f.css ?? ""}`;
    await writeFile(
      join(dir, `${name}.html`),
      `<!doctype html><html><head><style>${css}</style></head><body><main data-markswift-root>${f.html}</main></body></html>`,
    );
  }
  const config = join(dir, "markswift.json");
  await writeFile(
    config,
    JSON.stringify({
      library,
      out: library,
      components: components.map((c) => ({ name: c.name, source: `${c.name}.html` })),
    }),
  );
  await command([process.execPath, join(import.meta.dir, "../../src/cli.ts"), "build", config], dir, 300_000);
  return join(dir, library);
}

const xcodebuild = (scheme: string, cwd: string, dd: string) =>
  command(
    [
      "xcodebuild",
      "-scheme",
      scheme,
      "-destination",
      "generic/platform=iOS Simulator",
      "-derivedDataPath",
      dd,
      "build",
    ],
    cwd,
    900_000,
  );

nativeTest(
  "package of every emitter family builds for iOS with 0 warnings",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-package-"));
    try {
      const pkg = await buildFamilies(
        directory,
        "Families",
        FAMILIES.map((f) => ({ name: f.name, family: f.name })),
      );
      const files = await readdir(pkg, { recursive: true });
      expect(files.filter((f) => f.endsWith("MarkswiftRuntime.swift"))).toHaveLength(1);
      expect(await readdir(join(pkg, "Sources/Families/Fonts"))).toHaveLength(1);
      expect((await readdir(join(pkg, "Sources/Families/Images"))).length).toBeGreaterThan(0);
      const output = await xcodebuild("Families", pkg, join(directory, "dd"));
      expect(output).toContain("** BUILD SUCCEEDED **");
      expect(output.split("\n").filter((l) => l.includes("warning:"))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  1_200_000,
);

nativeTest(
  "two generated libraries build in one host",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-host-"));
    try {
      await buildFamilies(join(directory, "a"), "LibA", [
        { name: "CardView", family: "EffectsFamily" },
        { name: "SvgView", family: "SvgFamily" },
      ]);
      await buildFamilies(join(directory, "b"), "LibB", [
        { name: "CardView", family: "WebfontFamily" },
        { name: "ImageView", family: "ImageFamily" },
      ]);
      const host = join(directory, "Host");
      await mkdir(join(host, "Sources/Host"), { recursive: true });
      await writeFile(
        join(host, "Package.swift"),
        `// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Host",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [.library(name: "Host", targets: ["Host"])],
    dependencies: [.package(path: "../a/LibA"), .package(path: "../b/LibB")],
    targets: [
        .target(
            name: "Host",
            dependencies: [.product(name: "LibA", package: "LibA"), .product(name: "LibB", package: "LibB")],
            swiftSettings: [.defaultIsolation(MainActor.self)]
        ),
    ]
)
`,
      );
      await writeFile(
        join(host, "Sources/Host/HostView.swift"),
        `import SwiftUI
import LibA
import LibB

public struct HostView: View {
    public init() {}

    public var body: some View {
        VStack {
            LibA.CardView()
            LibB.CardView()
        }
    }
}
`,
      );
      const output = await xcodebuild("Host", host, join(directory, "dd"));
      expect(output).toContain("** BUILD SUCCEEDED **");
      expect(output.split("\n").filter((l) => l.includes("warning:"))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  1_200_000,
);

nativeTest(
  "brightness() multiplies like CSS and a clipped max-height box shows its first lines",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-pixels-"));
    try {
      const result = await convert(
        {
          html: '<main data-markswift-root><div class="t" style="background:#0ea5e9;filter:brightness(1.4)"></div><div class="t" style="background:#7c3aed;filter:brightness(.6)"></div><div class="clip">Line one<br>Line two<br>Line three</div></main>',
        },
        {
          name: "PixelProbe",
          mode: "app",
          theme: "light",
          css: "body{margin:0;background:#fff} main{width:200px} .t{width:40px;height:40px} .clip{max-height:40px;overflow:hidden;padding:8px 12px;font:15px/20px system-ui;color:#000;background:#fff}",
        },
      );
      const png = join(directory, "pixels.png");
      await renderMac(result, join(directory, "mac"), png);
      // Filtered views render in Display P3 on macOS; the browser's numbers are sRGB.
      const { data, info } = await sharp(png)
        .withIccProfile("srgb")
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
      // CSS brightness(k) is c·k per channel, clamped.
      const css = (rgb: number[], k: number) => rgb.map((c) => Math.min(255, Math.round(c * k)));
      const drift = (got: number[], want: number[]) => Math.max(...got.map((c, i) => Math.abs(c - want[i]!)));
      expect(drift(at(40, 40), css([14, 165, 233], 1.4))).toBeLessThanOrEqual(3);
      expect(drift(at(40, 120), css([124, 58, 237], 0.6))).toBeLessThanOrEqual(3);
      // The clipped box starts at y = 80 CSS px (160 device px): its 8 px top padding stays blank, as in CSS.
      let firstInk = -1;
      for (let y = 160; y < info.height && firstInk < 0; y++)
        for (let x = 0; x < info.width; x++)
          if (at(x, y)[0]! < 128) {
            firstInk = y - 160;
            break;
          }
      expect(firstInk).toBeGreaterThanOrEqual(16);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  240000,
);

nativeTest(
  "029: forced pressed and focused looks match the browser",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-029-"));
    const file = join(import.meta.dir, "../conformance/fixtures/_states/interactive-states.html");
    const browser = await chromium.launch({ channel: "chromium" });
    try {
      const result = await convert(
        { file },
        {
          name: "StatesProbe",
          mode: "fidelity",
          theme: "light",
          viewport: { width: 393, height: 800 },
          dpr: 2,
          browserChannel: "chromium",
        },
      );
      expect(result.code).toContain("@MarkswiftPressed");
      expect(result.code).toContain("@MarkswiftFocused");
      const states = [undefined, "pressed", "focused"] as const;
      const hash = async (path: string) =>
        createHash("sha256")
          .update(await Bun.file(path).bytes())
          .digest("hex");
      const scores: Record<string, number> = {};
      const hashes: Record<string, { browser: string; native: string }> = {};
      for (const forced of states) {
        const name = forced ?? "rest";
        const context = await browser.newContext({
          viewport: { width: 393, height: 800 },
          deviceScaleFactor: 2,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await page.goto(pathToFileURL(file).href);
        await page.addStyleTag({ content: "* { transition: none !important; }" });
        if (forced) {
          const cdp = await context.newCDPSession(page);
          await cdp.send("DOM.enable");
          await cdp.send("CSS.enable");
          const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
          const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
            nodeId: root.nodeId,
            selector: forced === "pressed" ? PRESSABLE_SELECTOR : TEXT_ENTRY_SELECTOR,
          });
          await forceStates(cdp, nodeIds, forced === "pressed" ? ["hover", "active"] : ["focus", "focus-visible"]);
        }
        const browserPng = join(directory, `browser-${name}.png`);
        await page
          .locator("[data-markswift-root]")
          .screenshot({ path: browserPng, scale: "device", animations: "disabled", caret: "hide" });
        await context.close();
        const nativePng = join(directory, `native-${name}.png`);
        await renderMac(result, join(directory, `mac-${name}`), nativePng, forced);
        scores[name] = (await compare(browserPng, nativePng, join(directory, `diff-${name}.png`), 2)).ssim;
        hashes[name] = { browser: await hash(browserPng), native: await hash(nativePng) };
      }
      console.log(`029 SSIM ${JSON.stringify(scores)}`);
      for (const forced of ["pressed", "focused"] as const) {
        // The state really changed on both sides.
        expect(hashes[forced]!.browser).not.toBe(hashes.rest!.browser);
        expect(hashes[forced]!.native).not.toBe(hashes.rest!.native);
        expect(scores[forced]!).toBeGreaterThanOrEqual(scores.rest! - 0.01);
      }
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  300000,
);

nativeTest(
  "extraction is pixel-identical to the unrolled view",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-030-"));
    const sources = [
      { name: "List24", result: () => convert({ file: "tests/conformance/fixtures/components/shadcn-list-24.html" }) },
      { name: "Settings", result: () => convertHtml(SETTINGS, { name: "Settings", css: SETTINGS_CSS }) },
      { name: "Icons", result: () => convertHtml(ICONS, { name: "Icons", css: ICONS_CSS }) },
      { name: "GridRadio", result: () => convertHtml(GRID_RADIO, { name: "GridRadio", css: GRID_RADIO_CSS }) },
    ];
    try {
      for (const source of sources) {
        const { name } = source;
        const result = await source.result();
        const dark = result.darkLayout!;
        const on = compileLayout(result.layout, { name, dark });
        const off = compileLayout(result.layout, { name, dark, extract: false });
        // The experiment really exercised extraction.
        expect(on.code).not.toBe(off.code);
        expect(on.code).toContain(`extension ${name} {`);
        const swiftDir = join(directory, name, "swift");
        for (const [file, content] of Object.entries(on.files)) await Bun.write(join(swiftDir, file), content);
        const check = await typecheck(swiftDir);
        if (!check.ok) throw new Error(check.output);
        const render = async (arm: typeof on, theme: "light" | "dark", tag: string) => {
          const png = join(directory, name, `${tag}-${theme}.png`);
          const layout = theme === "dark" ? dark : result.layout;
          await renderMac(
            { ...result, name, files: arm.files, assets: arm.assets, layout },
            join(directory, name, tag),
            png,
          );
          return sharp(png).raw().toBuffer();
        };
        for (const theme of ["light", "dark"] as const) {
          const a = await render(on, theme, "on");
          const b = await render(off, theme, "off");
          expect(Buffer.compare(a, b)).toBe(0);
          if (name !== "Settings" || theme !== "light") continue;
          // Negative control: one data value changed must change the render.
          const file = `${name}.swift`;
          const lines = on.files[file]!.split("\n");
          const row = lines.findIndex(
            (l, i) => i > lines.findIndex((s) => s.includes("static let ")) && /^\s*[A-Z]\w*\(id: /.test(l),
          );
          lines[row] = lines[row]!.replace(/(\(id: "(?:[^"\\]|\\.)*", [^"]*)"(?:[^"\\]|\\.)*"/, '$1"Zzzz"');
          const changed = await render({ ...on, files: { ...on.files, [file]: lines.join("\n") } }, theme, "control");
          expect(Buffer.compare(changed, b)).not.toBe(0);
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  900_000,
);

nativeTest(
  "generated component API is usable from another module",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "markswift-native-031-"));
    const usage = await Bun.file(join(import.meta.dir, "../helpers/component-usage.swift")).text();
    try {
      const results = [
        { name: "TeamCard", result: await convertHtml(TEAM, { name: "TeamCard", css: TEAM_CSS }) },
        { name: "SettingsCard", result: await convertHtml(PREFS, { name: "SettingsCard", css: PREFS_CSS }) },
      ];
      // Internal: the app's own module calls the views, the row structs and the memberwise subviews.
      const internal = join(directory, "internal");
      for (const { result } of results)
        for (const [file, content] of Object.entries(result.files)) await Bun.write(join(internal, file), content);
      await Bun.write(join(internal, "Usage.swift"), usage);
      const check = await typecheck(internal);
      if (!check.ok) throw new Error(check.output);
      // Public: a library module, called from a client through `import Generated`.
      const gen = join(directory, "gen");
      for (const { name, result } of results) {
        const lib = compileLayout(result.layout, { name, dark: result.darkLayout, visibility: "public" });
        expect(lib.code).toContain(`public struct ${name}: View`);
        for (const [file, content] of Object.entries(lib.files)) await Bun.write(join(gen, file), content);
      }
      await Bun.write(join(directory, "Usage.swift"), `import Generated\n${usage}`);
      const sdk = (await command(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"])).trim();
      const flags = [
        "-parse-as-library",
        "-sdk",
        sdk,
        "-target",
        "arm64-apple-ios18.0-simulator",
        "-swift-version",
        "6",
        "-strict-concurrency=complete",
        "-default-isolation",
        "MainActor",
      ];
      const sources = [...new Bun.Glob("*.swift").scanSync(gen)].map((f) => join(gen, f));
      const module = await command([
        "xcrun",
        "swiftc",
        "-emit-module",
        "-module-name",
        "Generated",
        "-emit-module-path",
        join(directory, "Generated.swiftmodule"),
        ...flags,
        ...sources,
      ]);
      const client = await command([
        "xcrun",
        "swiftc",
        "-typecheck",
        "-I",
        directory,
        ...flags,
        join(directory, "Usage.swift"),
      ]);
      expect(`${module}${client}`.split("\n").filter((l) => /\b(?:warning|error):/.test(l))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  300_000,
);
