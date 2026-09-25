/** Intrinsic CSS-pixel viewport and user-space viewBox of a standalone SVG resource. */
export interface SvgRootDimensions {
  size?: [number, number];
  viewBox: [number, number, number, number];
  notes: string[];
  /** A zero or negative absolute axis has no usable natural tile size. */
  invalid?: string;
}

const UNITS: Record<string, number> = {
  px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6,
  pt: 96 / 72, pc: 16, em: 16, rem: 16,
};

function length(raw: string | undefined): { px?: number; invalid?: true; unsupported?: true } {
  if (raw === undefined || raw.trim().endsWith("%")) return {};
  const match = /^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z]*)\s*$/i.exec(raw);
  if (!match) return { unsupported: true };
  const unit = (match[2] || "px").toLowerCase();
  const factor = UNITS[unit];
  if (factor === undefined) return { unsupported: true };
  const px = Number(match[1]) * factor;
  return px > 0 ? { px } : { invalid: true };
}

/**
 * SVG width/height set the image's natural viewport; viewBox only defines its internal
 * coordinate system. With two missing/percentage axes, an `<img>` fits the viewBox into
 * 300×150 while `background-size:auto` fits it into the background positioning area.
 * A non-positive absolute dimension is a zero-sized resource, not a missing dimension.
 */
export function svgRootDimensions(attrs: Record<string, string>, fallbackBox: [number, number] = [300, 150]): SvgRootDimensions | undefined {
  const width = length(attrs["width"]), height = length(attrs["height"]);
  const notes: string[] = [];
  for (const [name, parsed] of [["width", width], ["height", height]] as const) {
    if (parsed.unsupported) notes.push(`approximated: SVG intrinsic ${name} ${attrs[name]} is unsupported; viewBox ratio used`);
    else if (parsed.px !== undefined && /(?:em|rem)\s*$/i.test(attrs[name] ?? ""))
      notes.push(`approximated: SVG intrinsic ${name} ${attrs[name]} assumes 16px font size`);
  }

  const rawViewBox = attrs["viewbox"] ?? attrs["viewBox"];
  const vb = rawViewBox ? rawViewBox.trim().split(/[\s,]+/).map(Number) : undefined;
  let viewBox: [number, number, number, number];
  if (vb) {
    if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2]! <= 0 || vb[3]! <= 0) return undefined;
    viewBox = vb as [number, number, number, number];
  } else {
    if (width.px === undefined || height.px === undefined) return undefined;
    viewBox = [0, 0, width.px, height.px];
  }
  if (width.invalid || height.invalid) {
    const axis = [width.invalid ? "width" : "", height.invalid ? "height" : ""].filter(Boolean).join(" and ");
    return { viewBox, notes, invalid: `SVG intrinsic ${axis} is non-positive` };
  }
  const [, , vw, vh] = viewBox;
  let w = width.px, h = height.px;
  if (w === undefined && h === undefined) {
    const scale = Math.min(fallbackBox[0] / vw, fallbackBox[1] / vh);
    w = vw * scale;
    h = vh * scale;
  } else if (w === undefined) w = h! * vw / vh;
  else if (h === undefined) h = w * vh / vw;
  return { size: [w!, h!], viewBox, notes };
}
