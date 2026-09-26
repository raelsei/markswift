export function inputSnapshot(fields) {
  return {
    html: fields.html.value, css: fields.css.value, name: fields.name.value.trim(),
    mode: fields.mode.value, theme: fields.theme.value,
    viewport: { width: Number(fields.width.value), height: Number(fields.height.value) },
    ...(fields.layout.value === "responsive" ? {
      compactWidth: Number(fields.compactWidth.value), breakpoint: Number(fields.breakpoint.value),
    } : {}),
  };
}

export function validateInput(input) {
  if (!input.html.trim()) throw new Error("Paste HTML before converting.");
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(input.name)) throw new Error("View name must start with an uppercase letter and use letters, numbers or underscores.");
  if (input.name.length > 80) throw new Error("View name must be 80 characters or fewer.");
  const { width, height } = input.viewport;
  if (!boundedInteger(width, 240, 1920) || !boundedInteger(height, 240, 2400)) {
    throw new Error("Viewport width must be 240–1920 px and height 240–2400 px.");
  }
  if (input.compactWidth !== undefined || input.breakpoint !== undefined) {
    if (!boundedInteger(input.compactWidth, 240, 1920) || !boundedInteger(input.breakpoint, 240, 1919)) {
      throw new Error("Compact width must be 240–1920 px and breakpoint 240–1919 points, both whole numbers.");
    }
    if (!(input.compactWidth <= input.breakpoint && input.breakpoint < width)) {
      throw new Error("Compact width ≤ breakpoint < regular width is required.");
    }
  }
  return input;
}

function boundedInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}
