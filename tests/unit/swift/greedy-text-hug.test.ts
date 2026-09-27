import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { emitSwift } from "../../../src/swift/emit.ts";
import { textLineBoxFixture } from "../../helpers/text-line-box-fixture.ts";

function sample() {
  const screen = inferScreen(textLineBoxFixture(), "HugText");
  if (screen.root.kind !== "text") throw new Error("Expected plain text");
  return { ...screen, root: screen.root };
}

test("app greedy text fits content only when semantic width hugs", () => {
  const screen = sample();
  screen.root.width = { kind: "hug" };
  expect(emitSwift(screen, "HugText", { mode: "app" }).view).toContain("fitContent: true");
  for (const width of [{ kind: "fill" }, { kind: "fixed", px: 120 }, { kind: "fraction", value: 0.5, capturedPx: 120 }] as const) {
    screen.root.width = width;
    expect(emitSwift(screen, "OtherText", { mode: "app" }).view).not.toContain("fitContent: true");
  }
  screen.root.width = { kind: "hug" };
  expect(emitSwift(screen, "FidelityText", { mode: "fidelity" }).view).not.toContain("MarkswiftGreedyText(");
});

test("greedy hug limits constrain live content before padding and paint", () => {
  const screen = sample();
  screen.root.width = { kind: "hug" };
  screen.root.padding = [5, 7, 5, 11];
  screen.root.minWidth = 48;
  screen.root.maxWidth = 118;
  const code = emitSwift(screen, "CappedHug", { mode: "app" }).view;
  expect(code).toContain("fitContent: true, minWidth: 30.0, maxWidth: 100.0");
  expect(code).toContain(".padding(EdgeInsets(top: 5.0, leading: 11.0, bottom: 5.0, trailing: 7.0))");
  expect(code).not.toContain(".frame(minWidth: 48.0, maxWidth: 118.0");
  expect(code).not.toContain(".fixedSize(horizontal: true");
});

test("unsupported wrapping keeps existing capped native Text behavior", () => {
  const screen = sample();
  screen.root.width = { kind: "hug" };
  screen.root.maxWidth = 118;
  screen.root.wrapAnywhere = true;
  const code = emitSwift(screen, "NativeCap", { mode: "app" }).view;
  expect(code).not.toContain("MarkswiftGreedyText(");
  expect(code).toContain(".frame(maxWidth: 118.0");
  expect(code).toContain(".fixedSize(horizontal: true, vertical: false)");
});

test("a capped fill paragraph keeps its fill frame and native proposal", () => {
  const screen = sample();
  screen.root.width = { kind: "fill" };
  screen.root.maxWidth = 118;
  const code = emitSwift(screen, "FillCap", { mode: "app" }).view;
  expect(code).toContain("MarkswiftGreedyText(");
  expect(code).not.toContain("fitContent:");
  expect(code).toContain("maxWidth: 118.0");
});
