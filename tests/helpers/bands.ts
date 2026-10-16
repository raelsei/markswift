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

/** Plan 057: a viewport capture's content width of the `group` query container (bands 0, 0, 1, 1, 1). */
export const GROUP_WIDTHS: Record<number, number> = { 390: 358, 767: 735, 768: 432, 834: 498, 1376: 874 };

/**
 * Plan 057: captures at `widths` (default 390/767/834/1376) of a `group` query container whose `field` turns into a
 * row at a 448px content width (`@container (width >= 28rem)`); `side`: a second, 280px host; `wideColor`: the label
 * colour from 768px (a media-only difference inside the host).
 */
export function fieldGroupDocs(options: { side?: boolean; wideColor?: string; widths?: number[] } = {}): LayoutDoc[] {
  return (options.widths ?? [390, 767, 834, 1376]).map((w) => {
    const gw = GROUP_WIDTHS[w]!;
    const conditions: LayoutCondition[] = [
      { kind: "media", query: "(min-width: 768px)", matches: w >= 768 },
      { kind: "container", query: "(width >= 28rem)", container: "group", matches: gw >= 448 },
      ...(options.side
        ? [{ kind: "container" as const, query: "(width >= 28rem)", container: "side", matches: false }]
        : []),
    ];
    const field = (id: string, fw: number, row: boolean, cond: number) =>
      el(
        id,
        "div",
        { x: 16, y: 0, w: fw, h: row ? 36 : 64 },
        { display: "flex", "flex-direction": row ? "row" : "column", "column-gap": "8px", "row-gap": "8px" },
        [
          el(
            `${id}/label`,
            "label",
            { x: 16, y: 0, w: row ? 60 : fw, h: 20 },
            { color: options.wideColor && w >= 768 ? options.wideColor : "rgb(0, 0, 0)" },
            [txt("Email", 60)],
            options.wideColor ? { conditional: [0] } : {},
          ),
          el(`${id}/value`, "span", { x: row ? 84 : 16, y: row ? 0 : 28, w: 120, h: 36 }, {}, [txt("ada", 120)]),
        ],
        { conditional: [cond] },
      );
    return band(
      w,
      [
        el(
          "group",
          "div",
          // 8px padding: the content box is `gw` wide.
          { x: 8, y: 0, w: gw + 16, h: (gw >= 448 ? 36 : 64) + 16 },
          {
            display: "flex",
            "flex-direction": "column",
            "padding-top": "8px",
            "padding-right": "8px",
            "padding-bottom": "8px",
            "padding-left": "8px",
          },
          [field("field", gw, gw >= 448, 1)],
        ),
        ...(options.side
          ? [
              el("side", "div", { x: 16, y: 80, w: 280, h: 64 }, { display: "flex", "flex-direction": "column" }, [
                field("plan", 280, false, 2),
              ]),
            ]
          : []),
      ],
      conditions,
    );
  });
}
