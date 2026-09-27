import type { LayoutDoc, LayoutNode } from "../../src/model/layout.ts";
import { allocateIntrinsicTableColumns } from "../../src/analysis/table-intrinsic.ts";

export const AUTO_TABLE_HTML = `<table id="auto-table"><thead><tr><th id="city">City</th><th id="status">Status</th><th id="count">Count</th></tr></thead><tbody><tr><td id="oslo">Oslo</td><td id="ready">Ready</td><td id="number">1050</td></tr><tr><td id="stockholm">Stockholm</td><td id="waiting">Waiting</td><td id="small-number">908</td></tr></tbody></table>`;
export const AUTO_TABLE_CSS = `body{margin:0;font:14px/20px system-ui}table{width:100%;table-layout:auto;border-collapse:separate;border-spacing:6px 4px;padding:3px;border:2px solid #444}td,th{font-weight:400;padding:8px;text-align:left;vertical-align:top;border:1px solid #888}`;

/** Known whole-token advances drive synthetic geometry, never captured column proportions. */
export function autoTableFixture(width = 390): LayoutDoc {
  const tokens = [["Oslo", "Ready", "1050"], ["Stockholm", "Waiting", "908"]];
  const advances = [[32.97, 45.14, 36.22], [77.02, 54.16, 29.55]];
  const widths = allocateIntrinsicTableColumns([95.02, 72.16, 54.22], width - 34);
  const rows: LayoutNode[] = tokens.map((texts, row) => ({
    tag: "tr", attrs: {}, styles: { display: "table-row" }, bounds: { x: 11, y: 9 + row * 40, w: width - 22, h: 36 },
    children: texts.map((text, column) => {
      const x = 11 + widths.slice(0, column).reduce((a, b) => a + b, 0) + column * 6;
      return { tag: "td", id: `cell-${row}-${column}`, attrs: {}, preferredSize: { width: "auto", height: "auto" },
        styles: { display: "table-cell", "vertical-align": "top", "font-family": "system-ui", "font-size": "16px", "font-weight": "400", "line-height": "normal",
          "padding-top": "8px", "padding-right": "8px", "padding-bottom": "8px", "padding-left": "8px",
          "border-left-width": "1px", "border-right-width": "1px", "border-top-width": "1px", "border-bottom-width": "1px",
          "border-left-style": "solid", "border-right-style": "solid", "border-top-style": "solid", "border-bottom-style": "solid" },
        bounds: { x, y: 9 + row * 40, w: widths[column]!, h: 36 },
        children: [{ tag: "#text", attrs: {}, styles: {}, text, bounds: { x: x + 9, y: 18 + row * 40, w: advances[row]![column]!, h: 18 }, children: [] }],
      };
    }),
  }));
  const table: LayoutNode = { tag: "table", id: "auto-table", attrs: {}, preferredSize: { width: "100%", height: "auto" },
    styles: { display: "table", "table-layout": "auto", "border-collapse": "separate", "border-spacing": "6px 4px" },
    bounds: { x: 0, y: 0, w: width, h: 94 }, children: [{ tag: "tbody", attrs: {}, styles: { display: "table-row-group" }, bounds: { x: 11, y: 9, w: width - 22, h: 76 }, children: rows }],
  };
  return { version: 1, source: "auto-table-fixture", combo: { screen: "table", theme: "light", demoState: "normal" }, size: { w: width, h: 600 }, dpr: 1, canvas: "white", fonts: [],
    root: { tag: "main", attrs: {}, styles: { display: "block" }, bounds: { x: 0, y: 0, w: width, h: 600 }, children: [table] } };
}
