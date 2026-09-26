import { expect, test } from "bun:test";
import { compileLayout, type LayoutDoc } from "../../../src/compiler/index.ts";

function compile(type: "text" | "password" | "textarea", value: string, mode: "app" | "fidelity", readOnly = true) {
  const layout: LayoutDoc = {
    version: 1, source: "placeholders.html", combo: { screen: "placeholders", theme: "light", demoState: "normal" },
    size: { w: 180, h: 32 }, dpr: 1, canvas: "white", fonts: [],
    root: {
      id: "#field", tag: type === "textarea" ? "textarea" : "input",
      attrs: { type, value, placeholder: "Empty prompt", ...(readOnly ? { readonly: "" } : {}) },
      styles: { display: "inline-block", "font-family": "system-ui", "font-size": "14px", color: "rgb(0,0,0)" },
      bounds: { x: 0, y: 0, w: 180, h: 32 }, children: [],
    },
  };
  return compileLayout(layout, { name: "PlaceholderControls", mode });
}

test("empty readonly text, password and textarea controls show their prompt in both modes", () => {
  for (const mode of ["app", "fidelity"] as const) for (const type of ["text", "password", "textarea"] as const) {
    const result = compile(type, "", mode);
    expect(result.code).toContain('Text(verbatim: "Empty prompt")');
    expect(result.code).toContain(".foregroundStyle(Color(uiColor: .placeholderText))");
    expect(result.code).not.toContain("@State");
  }
});

test("nonempty readonly controls retain their captured value and normal paint, including password masking", () => {
  for (const mode of ["app", "fidelity"] as const) for (const type of ["text", "password", "textarea"] as const) {
    const result = compile(type, "secret", mode);
    expect(result.code).toContain(`Text(verbatim: "${type === "password" ? "••••••" : "secret"}")`);
    expect(result.code).not.toContain("Empty prompt");
    expect(result.code).not.toContain(".placeholderText");
  }
});

test("editable controls keep native bindings in app mode while fidelity retains empty prompts", () => {
  for (const type of ["text", "password", "textarea"] as const) {
    const app = compile(type, "", "app", false);
    expect(app.code).toContain("$s_field");
    expect(app.code).not.toContain(".placeholderText");
    const fidelity = compile(type, "", "fidelity", false);
    expect(fidelity.code).toContain('Text(verbatim: "Empty prompt")');
    expect(fidelity.code).toContain(".foregroundStyle(Color(uiColor: .placeholderText))");
  }
});
