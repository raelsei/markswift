import type { IntrinsicWidth } from "../model/intrinsic-width.ts";
import { num, str } from "./format.ts";
import { nativeTextWeight } from "./text-line-box.ts";

/** Native font/literal binding matches the admitted GreedyText supplied UIFont branch. */
export function intrinsicWidthExpr(program: IntrinsicWidth): string {
  const prefix = "MarkswiftIntrinsicWidth";
  switch (program.kind) {
    case "fixed": return `${prefix}.fixed(${num(program.value)})`;
    case "words": return `${prefix}.words([${program.text.split(" ").map(str).join(", ")}], size: ${num(program.font.size)}, weight: UIFont.Weight.${nativeTextWeight(program.font)}.rawValue)`;
    case "maximum": return `${prefix}.maximum([${program.children.map(intrinsicWidthExpr).join(", ")}])`;
    case "inset": return `${prefix}.inset(${num(program.value)}, ${intrinsicWidthExpr(program.content)})`;
  }
}
