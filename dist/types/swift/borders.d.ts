import type { SemNode } from "../model/semantic.ts";
import { type ColorCtx } from "./format.ts";
/**
 * Per-edge borders. An edge whose two corners are both square is a bar aligned to that edge —
 * the cheapest thing that is also exact. An edge that runs into a rounded corner is not: CSS
 * curves the border itself around the corner and hands it over to the neighbouring side at the
 * line from the border-box corner to the padding-box corner, so an edge whose neighbour has no
 * border keeps the whole arc. Clipping a straight bar to the box shape instead *deletes* that
 * arc — and with it the only thing separating two `input-otp` slots. Those edges are emitted as
 * `MarkswiftBorderSides`, which builds exactly that region; one expression per colour/style/width
 * group, so at most four per node however large the design gets.
 */
export declare function borderSideModifiers(n: SemNode, ctx: ColorCtx): string[];
