import type { SemNode } from "../model/semantic.ts";
/** Records an emit-time approximation on the node; idempotent because both modes emit the same tree. */
export function note(n: SemNode, text: string): void {
  if (!n.notes.includes(text)) n.notes.push(text);
  if (n.confidence === "mapped") n.confidence = "approximated";
}
