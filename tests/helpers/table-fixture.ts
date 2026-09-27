import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";

export function tableFixture(width = 390, side: "top" | "bottom" = "top"): LayoutDoc {
  const captionHeight = 20, captionExtent = 38;
  const y = side === "top" ? captionExtent : 0;
  const first = width * 0.25, second = 64, third = width - first - second;
  function cell(id: string, x: number, row: number, w: number, h: number, attrs: Record<string, string> = {}, tag = "td"): LayoutNode {
    return { id, tag, attrs, preferredSize: { width: "auto", height: "auto" },
      bounds: { x, y: y + row * 30, w, h },
      styles: { display: "table-cell", "box-sizing": "border-box", "vertical-align": "top", "background-color": "rgb(220,230,240)", "font-size": "14px", color: "rgb(20,30,40)", "padding-left": "4px", "padding-right": "4px" },
      children: [{ tag: "#text", attrs: {}, styles: {}, text: id, bounds: { x: x + 4, y: y + row * 30, w: 20, h: 16 }, children: [] }],
    };
  }
  const rows: LayoutNode[] = [
    { id: "row-a", tag: "tr", attrs: {}, styles: { display: "table-row" }, bounds: { x: 0, y, w: width, h: 30 }, children: [
      cell("#spanning-header", 0, 0, first, 60, { rowspan: "2", scope: "row" }, "th"),
      cell("#column-header", first, 0, second + third, 30, { colspan: "2" }, "th"),
    ] },
    { id: "row-b", tag: "tr", attrs: {}, styles: { display: "table-row" }, bounds: { x: 0, y: y + 30, w: width, h: 30 }, children: [
      cell("#fixed-cell", first, 1, second, 30), cell("#remaining-cell", first + second, 1, third, 30),
    ] },
  ];
  const cols: LayoutNode = { tag: "colgroup", attrs: {}, styles: { display: "table-column-group" }, bounds: { x: 0, y: 0, w: 0, h: 0 }, children: ["25%", "64px", "auto"].map(value => ({
    tag: "col", attrs: {}, styles: { display: "table-column" }, preferredSize: { width: value, height: "auto" }, bounds: { x: 0, y: 0, w: 0, h: 0 }, children: [],
  })) };
  const caption: LayoutNode = { id: "#caption", tag: "caption", attrs: {}, styles: { display: "table-caption", "caption-side": side, "margin-top": "6px", "margin-bottom": "12px" },
    bounds: { x: 0, y: side === "top" ? 6 : 66, w: width, h: captionHeight }, children: [{ tag: "#text", attrs: {}, styles: {}, text: "Release checks", bounds: { x: 0, y: side === "top" ? 6 : 66, w: 80, h: 16 }, children: [] }],
  };
  const table: LayoutNode = { id: "#table", tag: "table", attrs: {}, preferredSize: { width: "100%", height: "auto" },
    styles: { display: "table", "table-layout": "fixed", "border-collapse": "separate", "border-spacing": "0px", "background-color": "rgb(250,250,250)" },
    bounds: { x: 0, y: 0, w: width, h: 60 + captionExtent }, children: [caption, cols,
      { id: "#body", tag: "tbody", attrs: {}, styles: { display: "table-row-group" }, bounds: { x: 0, y, w: width, h: 60 }, children: rows },
    ],
  };
  return { version: 1, source: "table-fixture", combo: { screen: "table", theme: "light", demoState: "normal" }, size: { w: width, h: 600 }, dpr: 1, canvas: "white", fonts: [], root: {
    id: "#page", tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: width, h: 600 }, children: [table],
  } };
}

export const TABLE_HTML = `<table id="table"><caption id="caption">Grouped release checks</caption>
  <colgroup><col class="first"><col class="second"><col></colgroup>
  <thead><tr><th id="scope">Scope</th><th colspan="2" id="checks">Checks</th></tr></thead>
  <tbody><tr><th rowspan="2" id="core">Core</th><td id="cli">CLI</td><td id="passed">Passed</td></tr>
  <tr><td colspan="2" id="body-span">Bun and Node passed</td></tr>
  <tr><th id="preview">Preview</th><td id="web">Web</td><td id="last">Passed</td></tr></tbody>
  <tfoot><tr><td colspan="3" id="footer">Complete</td></tr></tfoot></table>`;
export const TABLE_CSS = `body{margin:0;font:14px/20px Arial,sans-serif}table{table-layout:fixed;width:100%;border-collapse:separate;border-spacing:6px 4px;padding:3px;border:2px solid #444}
  caption{text-align:left;margin:6px 0 12px}.first{width:25%}.second{width:64px}td,th{padding:8px;text-align:left;vertical-align:top;border:1px solid #888}
  thead{background:#ddd}tbody tr:nth-child(2){background:#eff}tfoot{background:#ddd}`;
