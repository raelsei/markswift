import { type SemNode, type DiagnosticLevel, addDiagnostic, confidenceOf } from "../model/semantic.ts";
/** Records an emit-time loss on the node and regrades it; idempotent because both modes emit the same tree. */
export function note(n: SemNode, level: DiagnosticLevel, feature: string, message: string): void {
  addDiagnostic(n.diagnostics, level, feature, message);
  n.confidence = confidenceOf(n.diagnostics);
}
