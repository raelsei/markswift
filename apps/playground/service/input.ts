import type { ConvertOptions } from "./core.ts";

export interface ConversionInput {
  html: string;
  css?: string;
  name?: string;
  mode?: "app" | "fidelity";
  viewport?: { width: number; height: number };
  theme?: "light" | "dark";
}

export class InputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const allowedKeys = new Set(["html", "css", "name", "mode", "viewport", "theme"]);

export function parseConversionInput(value: unknown): ConversionInput {
  if (!isObject(value)) throw new InputError("Expected a JSON object.");
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new InputError(`Unknown field: ${key}. Paste HTML and CSS instead of a URL or file path.`);
  }
  const { html, css, name, mode, viewport, theme } = value;
  if (typeof html !== "string" || !html.trim()) throw new InputError("html must be a non-empty string.");
  if (new TextEncoder().encode(html).length > 768 * 1024) throw new InputError("html exceeds the 768 KiB limit.", 413);
  if (css !== undefined && typeof css !== "string") throw new InputError("css must be a string.");
  if (typeof css === "string" && new TextEncoder().encode(css).length > 256 * 1024) throw new InputError("css exceeds the 256 KiB limit.", 413);
  if (name !== undefined && (typeof name !== "string" || name.length > 80 || !/^[A-Z][A-Za-z0-9_]*$/.test(name))) {
    throw new InputError("name must be a Swift type identifier starting with an uppercase ASCII letter (e.g. ProfileCard).");
  }
  if (mode !== undefined && mode !== "app" && mode !== "fidelity") throw new InputError("mode must be app or fidelity.");
  if (theme !== undefined && theme !== "light" && theme !== "dark") throw new InputError("theme must be light or dark.");
  if (viewport !== undefined && (!isObject(viewport) || Object.keys(viewport).some(key => key !== "width" && key !== "height")
    || !boundedInteger(viewport.width, 240, 1920) || !boundedInteger(viewport.height, 240, 2400))) {
    throw new InputError("viewport must contain integer width (240–1920) and height (240–2400).");
  }
  return {
    html,
    ...(css === undefined ? {} : { css: css as string }),
    ...(name === undefined ? {} : { name: name as string }),
    ...(mode === undefined ? {} : { mode: mode as ConversionInput["mode"] }),
    ...(viewport === undefined ? {} : { viewport: viewport as ConversionInput["viewport"] }),
    ...(theme === undefined ? {} : { theme: theme as ConversionInput["theme"] }),
  };
}

export function conversionOptions(input: ConversionInput): ConvertOptions {
  return {
    css: input.css,
    name: input.name,
    mode: input.mode,
    viewport: input.viewport,
    theme: input.theme,
    untrustedInput: true,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
