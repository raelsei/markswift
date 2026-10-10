import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import type { LayoutDoc } from "../../../src/model/layout.ts";

function capturedText(styles: Record<string, string>): LayoutDoc {
  return { version: 2, source: "constraints.html", combo: { screen: "constraints", theme: "light" }, size: { w: 200, h: 100 }, dpr: 1, canvas: "white", fonts: [],
    root: { id: "root", tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: 200, h: 100 }, children: [{
      id: "text", tag: "p", attrs: {}, styles: { display: "block", "box-sizing": "border-box", "font-family": "system-ui", "font-size": "14px", "line-height": "20px", ...styles }, bounds: { x: 0, y: 0, w: 200, h: 30 }, children: [{ tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w: 40, h: 16 }, text: "Hi", children: [] }],
    }] } };
}

test("native text retains a CSS minimum height even when inference identifies intrinsic content", () => {
  const screen = inferScreen(capturedText({ "min-height": "30px" }), "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    expect(emitSwift(screen, "ConstraintView", { mode }).view).toContain("minHeight: 30.0");
  }
});

test("a captured maximum height remains a frame constraint before clipping", () => {
  const input = capturedText({ "max-height": "10px", "overflow-y": "hidden" });
  input.root.children[0]!.bounds.h = 10;
  const screen = inferScreen(input, "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    expect(code).toContain("maxHeight: 10.0");
    expect(code.indexOf("maxHeight: 10.0")).toBeLessThan(code.indexOf(".clipShape("));
  }
});

test("a finite width cap stays on the painted box rather than being expanded by a later fill frame", () => {
  const screen = inferScreen(capturedText({}), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  const node = screen.root.children[0]!;
  node.width = { kind: "fill" };
  node.maxWidth = 120;
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    const section = code.slice(code.indexOf('Text(verbatim: "Hi")')).split("\n        }")[0]!;
    expect(section).toContain("maxWidth: 120.0");
    expect(section).not.toContain("maxWidth: .infinity");
  }
});

test("finite caps preserve intrinsic dimensions before background paint", () => {
  const screen = inferScreen(capturedText({ "background-color": "rgb(220, 80, 60)" }), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  const node = screen.root.children[0]!;
  node.width = { kind: "hug" };
  node.height = { kind: "hug" };
  node.maxWidth = 200;
  node.maxHeight = 100;
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    const capped = code.slice(code.indexOf("maxWidth: 200.0, maxHeight: 100.0"));
    expect(capped).toContain(".fixedSize(horizontal: true, vertical: true)");
    expect(capped.indexOf(".fixedSize(")).toBeLessThan(capped.indexOf(".background("));
  }
});

test("minimum height leaves block text at the top of its line box", () => {
  const screen = inferScreen(capturedText({ "min-height": "30px" }), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  expect(screen.root.children[0]!.padding).toEqual([0, 0, 10, 0]);
});

test("a height cap clipping the first line keeps its top rather than its center", () => {
  const input = capturedText({ "max-height": "10px", "overflow-y": "hidden" });
  input.root.children[0]!.bounds.h = 10;
  const screen = inferScreen(input, "constraints");
  for (const mode of ["app", "fidelity"] as const) {
    const code = emitSwift(screen, "ConstraintView", { mode }).view;
    expect(code).toContain("maxHeight: 10.0, alignment: .topLeading");
    if (mode === "fidelity") expect(code).toContain("height: 10.0, alignment: .topLeading");
  }
});

test("a measured fallback keeps its captured height in app mode instead of accepting extra space", () => {
  const screen = inferScreen(capturedText({}), "constraints");
  if (screen.root.kind !== "stack") throw new Error("expected stack");
  screen.root.height = { kind: "fixed", px: 100 };
  screen.root.padding = [0, 0, 0, 0];
  screen.root.measured = { width: 200, height: 100, frames: [{ x: 0, y: 0, w: 200, h: 30 }] };
  expect(emitSwift(screen, "ConstraintView", { mode: "app" }).view).toContain(".frame(height: 100.0, alignment: .topLeading)");
});
