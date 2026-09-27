/** Automatic tables whose whole cell strings have equal minimum/maximum content widths. */
import type { BundledFamilies } from "../model/fonts.ts";
import type { TableIntrinsicCell } from "../model/table.ts";
import { fontFamilies } from "../css/index.ts";
import { edgeWidth, insetsOf } from "./geometry.ts";
import { intent, ordinary } from "./table-columns.ts";
import type { TableStructure } from "./table-structure.ts";
import { collapseOf, normalizeWhitespace, noWrap } from "./text-runs.ts";
import { fontOf, SYSTEM_DESIGNS } from "./typography.ts";

export interface IntrinsicTableProof { cells: TableIntrinsicCell[]; browserMaximums: number[] }

export function intrinsicTableCells(structure: TableStructure, collapsed: boolean, families: BundledFamilies,
  decline: (reason: string) => undefined): IntrinsicTableProof | undefined {
  const reject = (reason: string) => decline(`automatic/intrinsic column allocation: ${reason}`);
  if (structure.caption) return reject("caption minimum-content sizing requires captured geometry");
  const columns = structure.columns.flatMap(column => [column, ...column.children]);
  if (columns.some(column => !ordinary(column) || !column.preferredSize || intent(column) !== "auto")) {
    return reject("specified column widths require a broader automatic allocation algorithm");
  }
  const cells: TableIntrinsicCell[] = [];
  const browserMaximums = Array<number>(structure.count).fill(0);
  for (const { node, placement } of structure.placed) {
    if (placement.columnSpan !== 1 || placement.rowSpan !== 1) return reject("spanning intrinsic cells require captured geometry");
    if (!node.preferredSize || intent(node) !== "auto" || node.preferredSize.hasRelativePadding
      || ["left", "right", "top", "bottom"].some(edge => !/^(?:0|\d+(?:\.\d+)?px)$/.test(node.styles[`padding-${edge}`] ?? "0"))) {
      return reject("cell widths and padding must be unconstrained resolved pixel lengths");
    }
    if (node.children.length > 1 || node.children.some(child => child.tag !== "#text") || node.flattenedCustomElements?.length) {
      return reject("only plain text cells have proven native intrinsic widths");
    }
    const styles = node.styles;
    const unsupported = [
      ["font-style", /^(?:normal)$/], ["font-variant-numeric", /^(?:normal)$/],
      ["letter-spacing", /^(?:normal|0(?:px)?)$/], ["text-transform", /^(?:none)$/],
      ["word-break", /^(?:normal)$/], ["overflow-wrap", /^(?:normal)$/],
      ["text-indent", /^(?:0(?:px)?)$/], ["text-overflow", /^(?:clip)$/],
    ] as const;
    if (unsupported.some(([property, neutral]) => styles[property] && !neutral.test(styles[property]!))
      || (styles["-webkit-line-clamp"] && styles["-webkit-line-clamp"] !== "none") || collapseOf(styles) !== "collapse") {
      return reject("text shaping, breaking or clipping modifiers require captured geometry");
    }
    const source = node.children[0];
    const text = normalizeWhitespace(source?.text ?? "", "collapse").text.trim();
    if (!(noWrap(styles) ? /^[\x20-\x7e]*$/.test(text) : /^[A-Za-z0-9_]*$/.test(text))) {
      return reject("cells need one unbreakable ASCII token or an explicitly nonwrapping ASCII string");
    }
    const family = fontFamilies(styles["font-family"])[0]?.toLowerCase();
    const font = fontOf(styles, families);
    if (!family || !SYSTEM_DESIGNS[family] || family === "cursive" || family === "fantasy"
      || font.family.kind !== "system" || font.size <= 0) {
      return reject("custom or unresolved fonts lack a matching native intrinsic descriptor");
    }
    if (text && (!source || source.bounds.w <= 0 || (source.lines && source.lines.length !== 1)
      || source.bounds.h > (font.lineHeight ?? font.size * 1.5) * 1.5)) {
      return reject("the captured whole-token text extent must occupy one line");
    }
    const inset = insetsOf(styles);
    const horizontalInset = inset[1] + inset[3] - (collapsed ? (edgeWidth(styles, "left") + edgeWidth(styles, "right")) / 2 : 0);
    cells.push({ column: placement.column, text, font, horizontalInset });
    browserMaximums[placement.column] = Math.max(browserMaximums[placement.column]!, (text ? source!.bounds.w : 0) + horizontalInset);
  }
  return { cells, browserMaximums };
}

/** CSS Tables 3 excess-width distribution for unconstrained columns with min=max. */
export function allocateIntrinsicTableColumns(maximums: number[], available: number): number[] {
  const total = maximums.reduce((sum, width) => sum + width, 0);
  const width = Math.max(available, total);
  return total > 0 ? maximums.map(value => value * width / total) : maximums.map(() => width / maximums.length);
}
