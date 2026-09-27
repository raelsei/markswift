import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";

/** Measured single-line ordinary text with complete default font and source-inset metadata. */
export function intrinsicMinContentFixture(): LayoutDoc {
  const styles: Record<string, string> = {
    display: "block", "box-sizing": "border-box", "font-family": "system-ui", "font-size": "14px", "font-weight": "400",
    "line-height": "20px", color: "rgb(20, 30, 40)", "white-space": "normal", "text-indent": "0px", "writing-mode": "horizontal-tb", direction: "ltr",
    "font-kerning": "auto", "font-feature-settings": "normal", "font-variation-settings": "normal",
    "font-variant-ligatures": "normal", "font-variant-caps": "normal", "font-variant-east-asian": "normal",
    "font-variant-position": "normal", "font-variant-alternates": "normal", "font-variant-numeric": "normal",
    "font-optical-sizing": "auto", "font-size-adjust": "none", "font-stretch": "100%",
    "font-synthesis": "weight style small-caps", "unicode-bidi": "normal", position: "static", float: "none",
    contain: "none", "content-visibility": "visible",
    "min-width": "auto", "max-width": "none", "min-height": "auto", "max-height": "none",
  };
  for (const edge of ["top", "right", "bottom", "left"]) Object.assign(styles, {
    [`padding-${edge}`]: "0px", [`margin-${edge}`]: "0px", [`border-${edge}-width`]: "0px", [`border-${edge}-style`]: "none",
  });
  const text = "Alpha Supercalifragilisticexpialidocious Beta";
  const subject: LayoutNode = {
    id: "subject", tag: "div", attrs: {}, sourceContentVisibility: "visible", styles: { ...styles, "min-width": "min-content" },
    preferredSize: { width: "auto", height: "auto", horizontalAutoMargins: [false, false] },
    bounds: { x: 16, y: 16, w: 358, h: 46 }, children: [{
      tag: "#text", attrs: {}, styles: {}, text, firstBaseline: 43,
      bounds: { x: 29, y: 30, w: 290, h: 17 },
      lines: [{ bounds: { x: 29, y: 30, w: 290, h: 17 }, start: 0, length: text.length, baseline: 43 }], children: [],
    }],
  };
  for (const edge of ["top", "right", "bottom", "left"]) Object.assign(subject.styles, {
    [`padding-${edge}`]: "12px", [`border-${edge}-width`]: "1px", [`border-${edge}-style`]: "solid", [`border-${edge}-color`]: "rgb(0, 0, 0)",
  });
  return { version: 1, source: "intrinsic-min-content.html", combo: { screen: "minimum", theme: "light", demoState: "normal" },
    size: { w: 390, h: 380 }, dpr: 2, canvas: "white", fonts: [], root: {
      id: "root", tag: "main", attrs: {}, sourceContentVisibility: "visible", styles: { ...styles, "padding-left": "16px", "padding-right": "16px" },
      preferredSize: { width: "100%", height: "380px" }, bounds: { x: 0, y: 0, w: 390, h: 380 }, children: [subject],
    } };
}

export function nestedMinContentFixture(): LayoutDoc {
  const doc = intrinsicMinContentFixture(), subject = doc.root.children[0]!, text = subject.children[0]!;
  const child: LayoutNode = { ...subject, id: "inner", styles: { ...subject.styles, "min-width": "auto" },
    bounds: { x: 29, y: 29, w: 332, h: 20 }, children: [text] };
  for (const edge of ["top", "right", "bottom", "left"]) Object.assign(child.styles, {
    [`padding-${edge}`]: edge === "left" || edge === "right" ? "7px" : "0px",
    [`border-${edge}-width`]: "0px", [`border-${edge}-style`]: "none",
  });
  text.bounds.x += 7; text.lines![0]!.bounds.x += 7;
  subject.children = [child];
  return doc;
}

/** Direct legend and one source checkbox/text pair; source objects stay distinct. */
export function fieldsetMinContentFixture(): LayoutDoc {
  const doc = intrinsicMinContentFixture(), fieldset = doc.root.children[0]!;
  fieldset.tag = "fieldset"; fieldset.bounds.h = 70;
  const styles = { ...fieldset.styles, "min-width": "auto" };
  for (const edge of ["top", "right", "bottom", "left"]) Object.assign(styles, {
    [`padding-${edge}`]: "0px", [`border-${edge}-width`]: "0px", [`border-${edge}-style`]: "none",
  });
  const text = (raw: string, x: number, y: number, w: number): LayoutNode => ({ tag: "#text", attrs: {}, styles: {}, text: raw,
    firstBaseline: y + 13, bounds: { x, y, w, h: 17 }, lines: [{ bounds: { x, y, w, h: 17 }, start: 0, length: raw.length, baseline: y + 13 }], children: [] });
  const preferredSize = { width: "auto", height: "auto", horizontalAutoMargins: [false, false] as [boolean, boolean] };
  const legend: LayoutNode = { id: "legend", tag: "legend", attrs: {}, sourceContentVisibility: "visible", styles: { ...styles, "padding-left": "5px", "padding-right": "5px" },
    preferredSize, bounds: { x: 29, y: 16, w: 133, h: 20 }, children: [text("Export preferences", 34, 17, 123)] };
  const widget: LayoutNode = { id: "widget", tag: "input", attrs: { type: "checkbox", checked: "" }, sourceContentVisibility: "visible",
    styles: { ...styles, appearance: "auto", "margin-left": "4px", "margin-right": "3px", "margin-top": "3px", "margin-bottom": "3px" },
    preferredSize, inlineControlMargins: [3, 3, 3, 4], bounds: { x: 33, y: 45, w: 13, h: 13 }, children: [] };
  const row: LayoutNode = { id: "row", tag: "label", attrs: {}, sourceContentVisibility: "visible", styles, preferredSize,
    bounds: { x: 29, y: 42, w: 332, h: 20 }, children: [widget, text(" Include diagnostics", 49, 43, 129)] };
  fieldset.children = [legend, row];
  return doc;
}
