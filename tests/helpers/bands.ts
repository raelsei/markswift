/** Hand-built width-band captures (plan 054): one `(min-width: 600px)` condition unless a test passes its own. */
import { LAYOUT_DOC_VERSION, type LayoutCondition, type LayoutDoc, type LayoutNode } from "../../src/model/layout.ts";

const TEXT = { "font-family": "system-ui", "font-size": "15px", "line-height": "20px", color: "rgb(0, 0, 0)" };

export function el(
  id: string,
  tag: string,
  bounds: LayoutNode["bounds"],
  styles: Record<string, string> = {},
  children: LayoutNode[] = [],
  extra: Partial<LayoutNode> = {},
): LayoutNode {
  return {
    id,
    tag,
    attrs: {},
    styles: { display: "block", "box-sizing": "border-box", ...TEXT, ...styles },
    preferredSize: { width: "auto", height: "auto" },
    bounds,
    children,
    ...extra,
  };
}

export function txt(text: string, w: number): LayoutNode {
  return { tag: "#text", attrs: {}, styles: {}, bounds: { x: 0, y: 0, w, h: 20 }, text, children: [] };
}

export function band(
  w: number,
  children: LayoutNode[],
  conditions: LayoutCondition[] = [{ kind: "media", query: "(min-width: 600px)", matches: w >= 600 }],
  theme: "light" | "dark" = "light",
): LayoutDoc {
  const h = Math.max(100, ...children.map((c) => c.bounds.y + c.bounds.h));
  return {
    version: LAYOUT_DOC_VERSION,
    source: "bands.html",
    combo: { screen: "bp", theme },
    size: { w, h },
    viewport: { x: 0, y: 0, w, h: 800 },
    conditions,
    dpr: 1,
    canvas: theme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)",
    fonts: [],
    root: el("root", "main", { x: 0, y: 0, w, h }, {}, children),
  };
}
