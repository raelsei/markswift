/** Native font descriptors for the plain nonbreaking automatic-table subset. */
import type { TableIntrinsicCell } from "../model/table.ts";
import { num, str } from "./format.ts";

const weights = ["ultraLight", "thin", "light", "regular", "medium", "semibold", "bold", "heavy", "black"];
const designs = { default: 0, rounded: 1, monospaced: 2, serif: 3 };

export function tableIntrinsicExpr(cell: TableIntrinsicCell): string {
  if (cell.font.family.kind !== "system") throw new Error("Native automatic tables require system fonts");
  // fontExpr chooses the nearest hundred; an exact tie chooses the lower named weight.
  const index = weights.reduce((best, _, i) => Math.abs((i + 1) * 100 - cell.font.weight)
    < Math.abs((best + 1) * 100 - cell.font.weight) ? i : best, 0);
  const font = `MarkswiftTableFont.system(size: ${num(cell.font.size)}, weight: .${weights[index]}, design: ${designs[cell.font.family.design]})`;
  return `.init(column: ${cell.column}, text: ${str(cell.text)}, font: ${font}, horizontalInset: ${num(cell.horizontalInset)})`;
}
