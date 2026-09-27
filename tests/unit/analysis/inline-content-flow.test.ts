import { expect, test } from "bun:test";
import { inferScreen } from "../../../src/analysis/infer.ts";
import { walk, type StackNode } from "../../../src/model/semantic.ts";
import { inlineContentFlowFixture } from "../../helpers/inline-content-flow-fixture.ts";
import { inlineRowReason } from "../../../src/analysis/inline-content-flow-admission.ts";
import { intrinsicSource } from "../../../src/analysis/intrinsic-min-content-source.ts";

function nodes(doc = inlineContentFlowFixture()) {
  const found = new Map<string, StackNode>();
  walk(inferScreen(doc, "InlineFlow").root, node => { if (node.kind === "stack") found.set(node.id, node); });
  return found;
}
test("single proved widget/source caption admits continuation independently of its captured fixed height", () => {
  const found = nodes(), row = found.get("row")!;
  expect(row.inlineBaseline).toBeDefined(); expect(row.height.kind).toBe("fixed");
  expect((row as any).inlineContentFlow).toMatchObject({ widget: 0, caption: 1, raw: " Include diagnostics" });
  expect(JSON.stringify((row as any).inlineContentFlow)).not.toContain('"height":31');
  expect((found.get("subject") as any).contentAutoHeight).toMatchObject({ trailingMargin: 6 });
});
test.each(["fixed", "min", "max", "percent", "missing", "stretch", "indent", "strut", "nowrap", "widget22", "no-space", "parent-flex"])("unsupported %s retains both numeric height and existing baseline path", variant => {
  const doc = inlineContentFlowFixture(), fieldset = doc.root.children[0]!, row = fieldset.children[1]!, widget = row.children[0]!;
  if (variant === "fixed") row.preferredSize!.height = "31px";
  if (variant === "min") row.styles["min-height"] = "60px";
  if (variant === "max") row.styles["max-height"] = "31px";
  if (variant === "percent") row.preferredSize!.height = "50%";
  if (variant === "missing") delete row.preferredSize;
  if (variant === "stretch") row.styles["font-stretch"] = "75%";
  if (variant === "indent") row.styles["text-indent"] = "80px";
  if (variant === "strut") delete row.inlineStrut;
  if (variant === "nowrap") row.styles["white-space"] = "nowrap";
  if (variant === "widget22") widget.bounds.w = widget.bounds.h = 22;
  if (variant === "no-space") row.children[1]!.text = "Include diagnostics";
  if (variant === "parent-flex") fieldset.styles.display = "flex";
  const actual = nodes(doc).get("row")!;
  expect((actual as any).inlineContentFlow).toBeUndefined();
  expect(actual.notes.join(" ")).toContain("inline continuation unavailable");
  expect((nodes(doc).get("subject") as any)?.contentAutoHeight).toBeUndefined();
});
test("physical parent insets and blocked final margin are owned once without source-height pin", () => {
  const actual = nodes().get("subject")!;
  expect((actual as any).contentAutoHeight).toMatchObject({ sourceInsets: [13, 13, 13, 13], trailingMargin: 6 });
  const doc = inlineContentFlowFixture(); doc.root.children[0]!.children[1]!.styles["margin-bottom"] = "-6px";
  expect((nodes(doc).get("subject") as any).contentAutoHeight).toBeUndefined();
});
test.each(["row", "parent"])("%s size containment cannot release source auto height", where => {
  const doc = inlineContentFlowFixture(), fieldset = doc.root.children[0]!, row = fieldset.children[1]!;
  (where === "row" ? row : fieldset).styles.contain = "size";
  const actual = nodes(doc);
  expect((actual.get("row") as any).inlineContentFlow).toBeUndefined();
  expect((actual.get("subject") as any).contentAutoHeight).toBeUndefined();
});
test.each(["contain", "content-visibility"])("missing %s metadata remains unproved, never an assumed default", property => {
  const doc = inlineContentFlowFixture(); delete doc.root.children[0]!.children[1]!.styles[property];
  const actual = nodes(doc);
  expect((actual.get("row") as any).inlineContentFlow).toBeUndefined();
  expect((actual.get("subject") as any).contentAutoHeight).toBeUndefined();
});
test.each([undefined, "auto", "hidden"])("original content visibility %s cannot be replaced by captured visible", original => {
  const doc = inlineContentFlowFixture(); doc.root.children[0]!.sourceContentVisibility = original;
  expect((nodes(doc).get("row") as any).inlineContentFlow).toBeUndefined();
  expect((nodes(doc).get("subject") as any).contentAutoHeight).toBeUndefined();
});
test.each([
  ["word-spacing", "4px"], ["word-spacing", undefined], ["line-break", "anywhere"], ["line-break", undefined], ["hyphens", "auto"], ["hyphens", undefined],
] as const)("word flow cannot guess %s:%s", (property, value) => {
  const doc = inlineContentFlowFixture(), row = doc.root.children[0]!.children[1]!;
  if (value === undefined) delete row.styles[property]; else row.styles[property] = value;
  expect((nodes(doc).get("row") as any).inlineContentFlow).toBeUndefined();
});
test("source side margins preserve their captured cap and decline live continuation", () => {
  const doc = inlineContentFlowFixture(), row = doc.root.children[0]!.children[1]!;
  Object.assign(row.styles, { "margin-left": "10px", "margin-right": "10px" });
  row.bounds.x += 10; row.bounds.w -= 20;
  for (const child of row.children) {
    child.bounds.x += 10;
    for (const line of child.lines ?? []) line.bounds.x += 10;
  }
  const actual = nodes(doc).get("row")!;
  expect(actual.width.kind).toBe("fill"); expect(actual.maxWidth).toBe(312);
  expect(actual.inlineContentFlow).toBeUndefined();
  expect(actual.notes.join(" ")).toContain("captured width cap or horizontal margins");
});
test("an independently synthesized width cap cannot borrow authored max-width none", () => {
  const actual = nodes().get("row")!, source = intrinsicSource(actual)!;
  expect(inlineRowReason(source, actual)).toBeUndefined();
  actual.maxWidth = 332;
  expect(inlineRowReason(source, actual)).toBe("captured width cap or horizontal margins");
});
test.each(["margin-left", "margin-right"])("missing physical %s declines live continuation", property => {
  const doc = inlineContentFlowFixture(); delete doc.root.children[0]!.children[1]!.styles[property];
  expect(nodes(doc).get("row")!.inlineContentFlow).toBeUndefined();
});
