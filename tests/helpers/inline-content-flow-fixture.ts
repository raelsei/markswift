import { fieldsetMinContentFixture } from "./intrinsic-min-content-fixture.ts";

/** Source auto-height fieldset with one ordinary CSS-strut widget/caption row. */
export function inlineContentFlowFixture() {
  const doc = fieldsetMinContentFixture(), fieldset = doc.root.children[0]!, legend = fieldset.children[0]!, row = fieldset.children[1]!;
  fieldset.bounds.h = 82;
  for (const node of [doc.root, fieldset, legend, row, row.children[0]!]) node.styles["min-height"] = "0px";
  legend.bounds.h = 20; legend.children[0]!.firstBaseline = 31; legend.children[0]!.lines![0]!.baseline = 31;
  row.bounds = { x: 29, y: 48, w: 332, h: 31 };
  row.styles = { ...row.styles, "padding-top": "5px", "padding-bottom": "5px", "margin-bottom": "6px" };
  row.inlineStrut = { ascent: 14, descent: 3, lineHeight: 20 };
  const widget = row.children[0]!, caption = row.children[1]!;
  widget.styles["vertical-align"] = "baseline";
  widget.bounds = { x: 33, y: 56, w: 13, h: 13 };
  caption.bounds = { x: 49, y: 55, w: 129, h: 17 }; caption.firstBaseline = 69;
  caption.lines = [{ bounds: { ...caption.bounds }, start: 0, length: caption.text!.length, baseline: 69 }];
  const defaults = (node: typeof row) => {
    if (node.tag !== "#text") {
      Object.assign(node.styles, { contain: "none", "content-visibility": "visible", "word-spacing": "0px", "line-break": "auto", hyphens: "manual" });
      node.sourceContentVisibility = "visible";
    }
    node.children.forEach(defaults);
  }; defaults(doc.root);
  return doc;
}
