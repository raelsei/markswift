import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { compileLayout } from "../../../src/compiler/index.ts";
import { constraintsOf } from "../../../src/analysis/size-constraints.ts";
import { intrinsicMinContentFixture, nestedMinContentFixture, fieldsetMinContentFixture } from "../../helpers/intrinsic-min-content-fixture.ts";
import { joinIntrinsicText } from "../../../src/analysis/intrinsic-min-content-source.ts";
import { attachIntrinsicMinimum } from "../../../src/analysis/intrinsic-min-content.ts";

function subject(doc = intrinsicMinContentFixture()) {
  const root = inferScreen(doc, "Minimum").root;
  if (root.kind !== "stack" && root.kind !== "grid") throw new Error("Expected ordinary root");
  return root.children[0]! as typeof root.children[number] & { intrinsicMinWidth?: { program?: unknown; authoredMaxWidth?: number } };
}

for (const location of ["root", "descendant"] as const) {
  test.each([undefined, "auto", "hidden"])(`post-settle visible cannot authorize ${location} source visibility:%s`, original => {
    const doc = location === "root" ? intrinsicMinContentFixture() : nestedMinContentFixture();
    const source = location === "root" ? doc.root.children[0]! : doc.root.children[0]!.children[0]!;
    if (original === undefined) delete source.sourceContentVisibility; else source.sourceContentVisibility = original;
    const node = subject(doc);
    expect(source.styles["content-visibility"]).toBe("visible");
    expect(node.intrinsicMinWidth?.program).toBeUndefined();
    expect(node.notes.join(" ")).toContain("source content-visibility");
  });
}

test.each(["containment", "rewritten-auto", "missing-origin"])("containing block %s cannot authorize a supplied-font minimum", kind => {
  const doc = intrinsicMinContentFixture();
  if (kind === "containment") doc.root.styles.contain = "size";
  if (kind === "rewritten-auto") doc.root.sourceContentVisibility = "auto";
  if (kind === "missing-origin") delete doc.root.sourceContentVisibility;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined();
  expect(node.notes.join(" ")).toContain("containing block");
});

test("ordinary fill min-content replaces only the app captured floor with supplied-font words", () => {
  const doc = intrinsicMinContentFixture(), node = subject(doc);
  expect(node.width).toEqual({ kind: "fill" }); expect(node.minWidth).toBe(358);
  expect(node.kind === "text" && !!node.lineBox).toBe(true);
  expect(node.intrinsicMinWidth?.program).toBeDefined();
  expect(JSON.stringify(node.intrinsicMinWidth)).not.toContain("358");
  const code = compileLayout(doc, { name: "Minimum", mode: "app" }).code;
  expect(code).toContain("MarkswiftIntrinsicWidth"); expect(code).toContain("Supercalifragilisticexpialidocious");
  expect(code).toContain("nativeWeight: UIFont.Weight.regular.rawValue");
  expect(code).not.toContain(".frame(minWidth: 358.0");
});

test("intrinsic request retains the original numeric maximum before minimum precedence", () => {
  const doc = intrinsicMinContentFixture(), source = doc.root.children[0]!;
  source.styles["max-width"] = "40px";
  const limits = constraintsOf(source, {}, { root: doc.root, parent: doc.root, fixed: [], bundledFamilies: {} }, []);
  expect(limits.minWidth).toBe(358); expect(limits.maxWidth).toBe(358);
  expect((limits as { intrinsicMinWidth?: { authoredMaxWidth?: number } }).intrinsicMinWidth?.authoredMaxWidth).toBe(40);
});

test.each([
  ["max-width", "50%", "relative"], ["margin-left", "10px", "margin"],
  ["font-stretch", "75%", "font-stretch"], ["aspect-ratio", "2 / 1", "aspect"],
  ["display", "flex", "ordinary"], ["white-space", "nowrap", "word"],
])("unsupported root %s:%s retains numeric fallback with an admission reason", (property, value, reason) => {
  const doc = intrinsicMinContentFixture(); doc.root.children[0]!.styles[property] = value;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined(); expect(node.minWidth).toBe(358);
  expect(node.notes.join(" ")).toContain(reason);
});

test("legacy paragraph predicate without lineBox is not a supplied-font admission", () => {
  const doc = intrinsicMinContentFixture(), source = doc.root.children[0]!;
  source.tag = "p"; delete source.children[0]!.firstBaseline; delete source.children[0]!.lines;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined(); expect(node.notes.join(" ")).toContain("shared native font");
});

test("auto content captured at its floor remains declined when geometry infers hug", () => {
  const doc = intrinsicMinContentFixture(), source = doc.root.children[0]!, text = source.children[0]!;
  doc.size.w = doc.root.bounds.w = 232; source.bounds.w = 236.69;
  text.text = "Supercalifragilisticexpialidocious"; text.bounds.w = text.lines![0]!.bounds.w = 210.69;
  text.lines![0]!.length = text.text.length;
  const node = subject(doc);
  expect(node.width.kind).toBe("hug"); expect(node.intrinsicMinWidth?.program).toBeUndefined();
  expect(node.notes.join(" ")).toContain("fill");
});

test("unconstrained ordinary descendants contribute their own physical insets once", () => {
  const node = subject(nestedMinContentFixture());
  expect(node.intrinsicMinWidth?.program).toBeDefined();
  const program = JSON.stringify(node.intrinsicMinWidth!.program);
  expect(program).toContain("14"); expect(program).toContain("26"); expect(program).not.toContain("332");
});

test.each(["40px", "50%"])("constrained descendant max-width:%s is declined even when glyphs overflow", value => {
  const doc = nestedMinContentFixture(); doc.root.children[0]!.children[0]!.styles["max-width"] = value;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined(); expect(node.notes.join(" ")).toContain("constrained descendant");
});

test("default parent cannot hide changed or missing descendant font metadata", () => {
  for (const missing of [false, true]) {
    const doc = nestedMinContentFixture(), child = doc.root.children[0]!.children[0]!;
    if (missing) delete child.styles["font-stretch"]; else child.styles["font-stretch"] = "75%";
    const node = subject(doc); expect(node.intrinsicMinWidth?.program).toBeUndefined();
    expect(node.notes.join(" ")).toContain(missing ? "metadata unavailable" : "font-stretch:75%");
  }
});

test.each(["80px", "-80px", "20%", "80px hanging", undefined])("root text-indent:%s cannot authorize ordinary word-width replay", value => {
  const doc = intrinsicMinContentFixture(), source = doc.root.children[0]!;
  if (value === undefined) delete source.styles["text-indent"]; else source.styles["text-indent"] = value;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined(); expect(node.minWidth).toBe(358);
  expect(node.notes.join(" ")).toContain(value === undefined ? "text-indent metadata unavailable" : `unsupported text-indent:${value}`);
});

test.each(["80px", "-80px", "20%", "80px hanging", undefined])("default parent cannot hide descendant text-indent:%s", value => {
  const doc = nestedMinContentFixture(), child = doc.root.children[0]!.children[0]!;
  if (value === undefined) delete child.styles["text-indent"]; else child.styles["text-indent"] = value;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined();
  expect(node.notes.join(" ")).toContain(value === undefined ? "text-indent metadata unavailable" : `unsupported text-indent:${value}`);
});

test.each(["flex", "grid"])("parent %s cannot authorize a replacement through child fill geometry", display => {
  const doc = intrinsicMinContentFixture(); doc.root.styles.display = display;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined();
  expect(node.notes.join(" ")).toContain("containing-block context unavailable");
});

for (const location of ["root", "descendant"] as const) {
  test.each([
    ["contain", undefined], ["content-visibility", undefined],
    ["contain", "size"], ["contain", "inline-size"], ["contain", "layout"],
    ["content-visibility", "auto"], ["content-visibility", "hidden"],
  ] as const)(`${location} %s:%s cannot authorize intrinsic content without known containment`, (property, value) => {
    const doc = location === "root" ? intrinsicMinContentFixture() : nestedMinContentFixture();
    const source = doc.root.children[0]!;
    const candidate = location === "root" ? source : source.children[0]!;
    if (value === undefined) delete candidate.styles[property]; else candidate.styles[property] = value;
    const node = subject(doc);
    expect(node.intrinsicMinWidth?.program).toBeUndefined();
    expect(node.notes.join(" ")).toContain("containment");
  });
}

test("standalone capture root does not establish an external containing block", () => {
  const doc = intrinsicMinContentFixture(); doc.root = doc.root.children[0]!;
  const node = inferScreen(doc, "Standalone").root;
  expect(node.intrinsicMinWidth?.program).toBeUndefined();
  expect(node.notes.join(" ")).toContain("standalone root");
});

test.each(["min-content", "max-content", "fit-content(100px)"])("parent intrinsic constraint %s retains the captured fallback", value => {
  const doc = intrinsicMinContentFixture(); doc.root.styles["min-width"] = value;
  const node = subject(doc);
  expect(node.intrinsicMinWidth?.program).toBeUndefined();
  expect(node.notes.join(" ")).toContain("containing block has an unproved intrinsic width constraint");
});

test("fieldset program owns legend insets, anonymous content and native atom margins separately", () => {
  const node = subject(fieldsetMinContentFixture());
  expect(node.intrinsicMinWidth?.program).toBeDefined();
  const serialized = JSON.stringify(node.intrinsicMinWidth!.program);
  expect(serialized).toContain('"text":"Export preferences"');
  expect(serialized).toContain('"kind":"fixed","value":20');
  expect(serialized).toContain('"value":10'); expect(serialized).toContain('"value":26');
  expect(serialized).not.toContain("332"); expect(serialized).not.toContain("133");
});

test.each(["none", "float", "relative", "adjacent", "missing-margins"])("widget %s declines the inline contribution without guessing topology", variant => {
  const doc = fieldsetMinContentFixture(), row = doc.root.children[0]!.children[1]!, widget = row.children[0]!;
  if (variant === "none") widget.styles.appearance = "none";
  if (variant === "float") widget.styles.float = "left";
  if (variant === "relative") widget.styles.position = "relative";
  if (variant === "adjacent") row.children[1]!.text = "Include diagnostics";
  if (variant === "missing-margins") delete widget.inlineControlMargins;
  expect(subject(doc).intrinsicMinWidth?.program).toBeUndefined();
});

test("equal source id/text cannot replace the actual direct text object", () => {
  const doc = intrinsicMinContentFixture(), source = doc.root.children[0]!, node = subject(doc);
  if (node.kind !== "text") throw new Error("Expected text");
  const clone = { ...source.children[0]!, id: source.children[0]!.id };
  joinIntrinsicText(source, node, [{ node: clone, styleOf: source }], true,
    { root: doc.root, parent: doc.root, parentDisplay: "block", parentAxis: "v", fixed: [], bundledFamilies: {} });
  attachIntrinsicMinimum(node);
  expect(node.intrinsicMinWidth?.program).toBeUndefined();
  expect(node.notes.join(" ")).toContain("source text/run ownership unavailable");
});

test("absolute text-leaf child is observed before admission, not added after a stale program", () => {
  const doc = intrinsicMinContentFixture(), source = doc.root.children[0]!;
  source.children.push({ tag: "div", attrs: {}, styles: { ...source.styles, "min-width": "auto", position: "absolute" },
    bounds: { x: 29, y: 29, w: 20, h: 20 }, preferredSize: { width: "20px", height: "20px" }, children: [] });
  expect(subject(doc).intrinsicMinWidth?.program).toBeUndefined();
});
