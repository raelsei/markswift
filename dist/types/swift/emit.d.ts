/** Assemble a screen from cohesive Swift emission modules. */
import type { Screen } from "../model/semantic.ts";
import type { EmitOptions, SwiftOutput } from "./context.ts";
export type { EmitMode, EmitOptions, SwiftOutput } from "./context.ts";
export { SWIFT_RUNTIME } from "./runtime.ts";
export declare function emitSwift(screen: Screen, viewName: string, opts: EmitOptions): SwiftOutput;
