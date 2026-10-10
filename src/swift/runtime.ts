import core from "./runtime/core.swift" with { type: "text" };
import controls from "./runtime/controls.swift" with { type: "text" };
import measuredLayout from "./runtime/measured-layout.swift" with { type: "text" };
import flow from "./runtime/flow.swift" with { type: "text" };

/**
 * `MarkswiftRuntime.swift`. `controls.swift` opens with `import UniformTypeIdentifiers`, which
 * Swift accepts anywhere at file scope, so every part is appended at top level.
 */
export const SWIFT_RUNTIME = core + "\n" + [controls, measuredLayout, flow].join("\n\n");
