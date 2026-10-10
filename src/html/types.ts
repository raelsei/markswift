import type { Diagnostic } from "../model/semantic.ts";

/** Compiler strategies describe routing, not a promise of pixel-perfect or behavioral coverage. */
export type ElementRoute = "flow" | "text" | "control" | "image" | "svg" | "line-break" | "metadata" | "placeholder";
export type ElementSupport = "implemented" | "approximated" | "unsupported" | "nonvisual";

export interface ElementPolicy {
  readonly route: ElementRoute;
  readonly support: ElementSupport;
  /** An atomic element must reach inference instead of being swallowed by its parent's text. */
  readonly atomic: boolean;
  readonly known: boolean;
  readonly diagnostic?: Diagnostic;
}
