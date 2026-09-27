import type { SemNode } from "../model/semantic.ts";
import { intrinsicContribution } from "./intrinsic-min-content-program.ts";
import { finish } from "./node-base.ts";

/** Numeric constraints remain unchanged; only a proved app replacement carries a program. */
export function attachIntrinsicMinimum<T extends SemNode>(node: T): T {
  if (!node.intrinsicMinWidth) return node;
  const result = intrinsicContribution(node, true);
  if (result.program) {
    node.intrinsicMinWidth.program = result.program;
    node.notes.push("approximated: app min-content uses supplied native font advances; browser/platform glyph advances may differ");
  }
  else {
    delete node.intrinsicMinWidth.program;
    node.notes.push(`approximated: native min-content unavailable (${result.reason}); captured minimum retained`);
  }
  return finish(node);
}
