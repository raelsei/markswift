import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { EmitMode } from "../../../src/swift/context.ts";
import type { LayoutDoc, LayoutNode } from "../../../src/model/layout.ts";

const FONT = { "font-family": "system-ui", "font-size": "17px", "font-weight": "400", "line-height": "22px", color: "rgb(24, 32, 42)" };

function text(value: string, x: number, y: number, w: number, h: number): LayoutNode {
  return { tag: "#text", attrs: {}, styles: {}, bounds: { x, y, w, h }, text: value, children: [] };
}

function swift(children: LayoutNode[], mode: EmitMode): string {
  const doc: LayoutDoc = {
    version: 2, source: "a11y.html", combo: { screen: "a11y", theme: "light" },
    size: { w: 320, h: 400 }, dpr: 2, canvas: "white", fonts: [],
    root: { tag: "main", id: "root", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 320, h: 400 }, children },
  };
  return emitSwift(inferScreen(doc, "A11y"), "A11yView", { mode }).view;
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("app-mode system fonts scale with Dynamic Type; fidelity and SVG text stay fixed", () => {
  const page = [
    { tag: "h2", id: "title", attrs: {}, styles: { ...FONT, display: "block", "font-size": "24px", "font-weight": "700", "line-height": "32px" }, bounds: { x: 0, y: 0, w: 320, h: 32 }, children: [text("Settings", 0, 0, 100, 32)] },
    { tag: "p", id: "body", attrs: {}, styles: { ...FONT, display: "block" }, bounds: { x: 0, y: 40, w: 320, h: 22 }, children: [text("Short body.", 0, 40, 90, 22)] },
  ];
  const app = swift(page, "app");
  expect(count(app, "@ScaledMetric(relativeTo: .title2) private var textSize24: CGFloat = 24.0")).toBe(1);
  expect(count(app, "@ScaledMetric(relativeTo: .body) private var textSize17: CGFloat = 17.0")).toBe(1);
  expect(app).toContain(".system(size: textSize24, weight: .bold, design: .default)");
  expect(app).toContain(".system(size: textSize17, weight: .regular, design: .default)");

  const fidelity = swift(page, "fidelity");
  expect(fidelity).toContain(".system(size: 24.0, weight: .bold, design: .default)");
  expect(fidelity).not.toContain("@ScaledMetric");

  const styles = { "font-family": "system-ui", "font-size": "12px", "font-weight": "400", fill: "rgb(0, 0, 0)" };
  const chart: LayoutNode = {
    tag: "svg", attrs: { viewbox: "0 0 100 50" }, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 100, h: 50 },
    children: [{ tag: "text", attrs: { x: "0", y: "12" }, styles, bounds: { x: 0, y: 0, w: 24, h: 12 }, children: [{ ...text("Jan", 0, 0, 24, 12), styles }] }],
  };
  const svg = swift([chart], "app");
  expect(svg).toContain(".system(size: 12.0");
  expect(svg).not.toContain("@ScaledMetric");
});

const radius = (r: string) => ({ "border-top-left-radius": r, "border-top-right-radius": r, "border-bottom-right-radius": r, "border-bottom-left-radius": r });
const padding = (v: number, h: number) => ({ "padding-top": `${v}px`, "padding-right": `${h}px`, "padding-bottom": `${v}px`, "padding-left": `${h}px` });

test("a button's and a link's box is inside the label, so it is the hit and press area", () => {
  const button: LayoutNode = {
    tag: "button", id: "save", attrs: {}, styles: { ...FONT, display: "inline-block", ...padding(8, 16), "background-color": "rgb(37, 99, 235)", ...radius("8px") },
    bounds: { x: 0, y: 0, w: 70, h: 38 }, children: [text("Save", 16, 8, 38, 22)],
  };
  const link: LayoutNode = {
    tag: "a", id: "open", attrs: { href: "https://example.com" }, styles: { ...FONT, display: "block", ...padding(8, 8) },
    bounds: { x: 0, y: 50, w: 320, h: 38 }, children: [text("Open", 8, 58, 40, 22)],
  };
  for (const mode of ["app", "fidelity"] as const) {
    const out = swift([button], mode);
    expect(out.indexOf(".background(")).toBeGreaterThan(-1);
    expect(out.indexOf(".background(")).toBeLessThan(out.indexOf(".buttonStyle(.plain)"));
    const shape = out.indexOf(".contentShape(RoundedRectangle(cornerRadius: 8.0, style: .circular))");
    expect(shape).toBeGreaterThan(-1);
    expect(shape).toBeLessThan(out.indexOf(".buttonStyle(.plain)"));

    const a = swift([link], mode);
    const dest = a.indexOf("Link(destination:");
    const pad = a.indexOf(".padding(8.0)");
    expect(dest).toBeGreaterThan(-1);
    expect(dest).toBeLessThan(pad);
    expect(pad).toBeLessThan(a.indexOf(".contentShape(Rectangle())"));
  }
});
