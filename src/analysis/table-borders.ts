/**
 * The collapsing border model (CSS 2.1 §17.6.2) over a captured table. Chrome resolves every grid
 * line to one border (hidden wins, then the widest, then the stronger style, then cell > row >
 * row group > table, then the box further up/left), paints it centred on the line and lays each
 * cell out with half of it inside on every side; the table's box holds the outer halves. Each
 * box paints only its own computed border, so the resolved line is rewritten into the boxes'
 * styles instead: half of it on each side of the line. A line that is the same along a whole
 * row is painted by the row (a hugging cell can be shorter than its row), and its cells keep
 * the half as padding; any other line is painted by the cells.
 */
import type { LayoutNode, Rect } from "../model/layout.ts";
import { px } from "../css/index.ts";
import { EDGES, type EdgeName, renders, unionRect } from "./geometry.ts";

interface Border {
  width: number;
  style: string;
  color: string;
}
interface Part {
  node: LayoutNode;
  rect: Rect;
}
interface Segment {
  horizontal: boolean;
  at: number;
  from: number;
  to: number;
}

const GROUP = /^table-(row|header|footer)-group$/;
const STYLE_RANK: Record<string, number> = {
  double: 8,
  solid: 7,
  dashed: 6,
  dotted: 5,
  ridge: 4,
  outset: 3,
  groove: 2,
  inset: 1,
};
const EPS = 0.02;

function segment(r: Rect, e: EdgeName): Segment {
  if (e === "top" || e === "bottom")
    return { horizontal: true, at: e === "top" ? r.y : r.y + r.h, from: r.x, to: r.x + r.w };
  return { horizontal: false, at: e === "left" ? r.x : r.x + r.w, from: r.y, to: r.y + r.h };
}

/** Same line, overlapping by more than a point. */
function meets(a: Segment, b: Segment): boolean {
  return (
    a.horizontal === b.horizontal &&
    Math.abs(a.at - b.at) <= EPS &&
    Math.min(a.to, b.to) - Math.max(a.from, b.from) > EPS
  );
}

/** The border that wins on `seg`; `parts` in precedence order (cells top-left first, rows, groups, table). */
function resolve(parts: Part[], seg: Segment): Border | undefined {
  let best: Border | undefined;
  for (const p of parts)
    for (const e of EDGES) {
      if (!meets(segment(p.rect, e), seg)) continue;
      const s = p.node.styles;
      const style = s[`border-${e}-style`] ?? "none";
      if (style === "hidden") return undefined;
      const width = px(s[`border-${e}-width`]);
      if (style === "none" || width <= 0) continue;
      const b = { width, style, color: s[`border-${e}-color`] ?? "currentcolor" };
      if (!best || width > best.width || (width === best.width && STYLE_RANK[style]! > STYLE_RANK[best.style]!))
        best = b;
    }
  return best;
}

/** `table` with its collapsed borders rewritten into its own, its row groups', rows' and cells' styles. */
export function collapseTableBorders(table: LayoutNode): LayoutNode {
  if (!/^(inline-)?table$/.test(table.styles["display"] ?? "")) return table;
  const rows: LayoutNode[] = [];
  const groups: LayoutNode[] = [];
  for (const c of table.children.filter(renders)) {
    const d = c.styles["display"] ?? "";
    if (GROUP.test(d)) {
      groups.push(c);
      rows.push(...c.children.filter((r) => renders(r) && r.styles["display"] === "table-row"));
    } else if (d === "table-row") rows.push(c);
  }
  if (!rows.length) return table;
  rows.sort((a, b) => a.bounds.y - b.bounds.y);
  const cellsOf = new Map(
    rows.map((r) => [
      r,
      r.children
        .filter((c) => renders(c) && c.styles["display"] === "table-cell")
        .sort((a, b) => a.bounds.x - b.bounds.x),
    ]),
  );
  const cells = [...cellsOf.values()].flat();
  const grid = rows.map((r) => r.bounds).reduce(unionRect);
  // ponytail: `border-collapse` is not captured (LayoutDoc 3), so rows and cells that abut read as
  // collapsed: a separated table with `border-spacing: 0` is misread. Capture it with LayoutDoc 4.
  const abut = (a: number, b: number) => Math.abs(a - b) <= EPS;
  for (let i = 1; i < rows.length; i++)
    if (!abut(rows[i - 1]!.bounds.y + rows[i - 1]!.bounds.h, rows[i]!.bounds.y)) return table;
  if (!cells.every((c) => abut(c.bounds.x, grid.x) || cells.some((o) => abut(o.bounds.x + o.bounds.w, c.bounds.x))))
    return table;

  const parts: Part[] = [...cells, ...rows, ...groups].map((node) => ({ node, rect: node.bounds }));
  parts.push({ node: table, rect: grid });
  const styles = new Map<LayoutNode, Record<string, string>>();
  const set = (n: LayoutNode, e: EdgeName, b: Border | undefined) => {
    let s = styles.get(n);
    if (!s) styles.set(n, (s = { ...n.styles }));
    s[`border-${e}-style`] = b ? b.style : "none";
    s[`border-${e}-width`] = b ? `${b.width / 2}px` : "0px";
    if (b) s[`border-${e}-color`] = b.color;
  };
  for (const n of [table, ...groups, ...rows]) for (const e of EDGES) set(n, e, undefined);
  for (const e of EDGES) set(table, e, resolve(parts, segment(grid, e)));
  for (const c of cells) for (const e of ["left", "right"] as const) set(c, e, resolve(parts, segment(c.bounds, e)));
  for (const row of rows)
    for (const e of ["top", "bottom"] as const) {
      const line = segment(row.bounds, e);
      const own = cellsOf.get(row)!;
      const borders = own.map((c) => resolve(parts, segment(c.bounds, e)));
      // A `rowspan` cell crossing the line, or ending on it from another row, splits the line.
      const whole =
        cells.every((c) => own.includes(c) === meets(segment(c.bounds, e), line)) &&
        !cells.some(
          (c) =>
            c.bounds.y < line.at - EPS &&
            c.bounds.y + c.bounds.h > line.at + EPS &&
            Math.min(line.to, c.bounds.x + c.bounds.w) - Math.max(line.from, c.bounds.x) > EPS,
        ) &&
        borders.every(
          (b) => b?.width === borders[0]?.width && b?.style === borders[0]?.style && b?.color === borders[0]?.color,
        );
      own.forEach((c, i) => {
        set(c, e, whole ? undefined : borders[i]);
        if (!whole) return;
        const s = styles.get(c)!;
        s[`padding-${e}`] = `${px(s[`padding-${e}`]) + (borders[i]?.width ?? 0) / 2}px`;
      });
      if (whole) set(row, e, borders[0]);
    }
  const rewrite = (n: LayoutNode): LayoutNode => {
    const s = styles.get(n);
    const children = n === table || groups.includes(n) || rows.includes(n) ? n.children.map(rewrite) : n.children;
    return s || children !== n.children ? { ...n, ...(s ? { styles: s } : {}), children } : n;
  };
  return rewrite(table);
}
